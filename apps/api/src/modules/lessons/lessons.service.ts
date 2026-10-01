import type {
  JwtPayload,
  LessonPlayDTO,
  LessonProgressDTO,
  ProgressInput,
  ProgressResultDTO,
} from '@miss-ann/shared';
import { Role, LESSON_COMPLETE_MIN_PERCENT, VideoProvider } from '@miss-ann/shared';
import { prisma } from '../../lib/prisma.js';
import { badRequest, forbidden, notFound } from '../../lib/http.js';
import { env } from '../../lib/env.js';
import { buildSignedEmbedUrl } from '../../lib/bunny.js';
import { createYouTubeVideoKey } from '../../lib/youtube.js';
import { assertEnrollment, isEnrolled } from '../courses/enrollment.service.js';

// النسبة يرسلها العميل؛ الخادم لا يقبل زيادة أكبر مما يمكن مشاهدته فعلاً منذ آخر حفظ
// (أقصى سرعة تشغيل × الوقت المنقضي + هامش) — يمنع إرسال 100٪ مباشرة لتخطي شرط الإكمال
const MAX_PLAYBACK_RATE = 2;
const PROGRESS_SLACK_SEC = 30;

export const isStaff = (role: Role): boolean => role === Role.ADMIN || role === Role.ASSISTANT;

// الفيديو الفعّال للحصة حسب المصدر المختار
export function activeVideo(l: {
  videoProvider: VideoProvider;
  bunnyVideoId: string | null;
  youtubeVideoId: string | null;
}): { provider: VideoProvider; id: string } | null {
  const id = l.videoProvider === VideoProvider.YOUTUBE ? l.youtubeVideoId : l.bunnyVideoId;
  return id ? { provider: l.videoProvider, id } : null;
}

// بوابة الوصول لحصة: الطاقم يصل دائماً؛ غيرهم: معاينة مجانية أو اشتراك ساري.
// كورس مخفي: المشترك الساري يكمل (الإخفاء يوقف الاشتراكات الجديدة فقط)، وغيره لا يرى الحصة أصلاً (404)
export async function loadAccessibleLesson(lessonId: number, user: JwtPayload) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      courseId: true,
      title: true,
      videoProvider: true,
      bunnyVideoId: true,
      youtubeVideoId: true,
      isFreePreview: true,
      durationSec: true,
      course: { select: { isPublished: true } },
    },
  });
  if (!lesson) throw notFound('الحصة غير موجودة');
  if (isStaff(user.role)) return lesson;

  if (!lesson.course.isPublished && !(await isEnrolled(user.sub, lesson.courseId))) throw notFound('الحصة غير موجودة');
  if (!lesson.isFreePreview) await assertEnrollment(user.sub, lesson.courseId);
  return lesson;
}

// ── رابط تشغيل موقّع + علامة مائية شخصية ─────────────────────────
export async function getPlayback(lessonId: number, user: JwtPayload): Promise<LessonPlayDTO> {
  const lesson = await loadAccessibleLesson(lessonId, user);
  const video = activeVideo(lesson);
  if (!video) throw notFound('لم يُرفع فيديو لهذه الحصة بعد');

  const student = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { name: true, phone: true, isActive: true },
  });
  if (!student || !student.isActive) throw forbidden('الحساب غير مفعّل');

  const progress = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId: user.sub, lessonId } },
  });

  const base = {
    lessonId,
    watermarkText: `${student.name} • ${student.phone.slice(-4)}`,
    progress: toProgressDTO(progress),
  };

  if (video.provider === VideoProvider.YOUTUBE) {
    const expiresAt = new Date(Date.now() + env.YOUTUBE_SESSION_TTL_SEC * 1000);
    return {
      ...base,
      provider: 'YOUTUBE',
      videoKey: createYouTubeVideoKey(video.id),
      expiresAt: expiresAt.toISOString(),
    };
  }

  const { embedUrl, expiresAt } = buildSignedEmbedUrl(video.id);
  return { ...base, provider: 'BUNNY', embedUrl, expiresAt: expiresAt.toISOString() };
}

// ── حفظ التقدّم (النسبة لا تتراجع) + الإكمال ─────────────────────
export async function saveProgress(
  lessonId: number,
  user: JwtPayload,
  input: ProgressInput,
): Promise<ProgressResultDTO> {
  const lesson = await loadAccessibleLesson(lessonId, user);

  const existing = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId: user.sub, lessonId } },
  });
  const previous = existing?.percent ?? 0;
  const reported = clampReportedPercent(input.percent, previous, lesson.durationSec, existing?.updatedAt);
  const percent = Math.round(Math.max(previous, reported) * 10) / 10;

  let completedAt = existing?.completedAt ?? null;
  let justCompleted = false;
  if (input.completed && !completedAt) {
    if (percent < LESSON_COMPLETE_MIN_PERCENT) {
      throw badRequest(`شاهد ${LESSON_COMPLETE_MIN_PERCENT}٪ من الحصة على الأقل قبل إكمالها`);
    }
    completedAt = new Date();
    justCompleted = true;
  }

  const saved = await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId: user.sub, lessonId } },
    create: {
      userId: user.sub,
      lessonId,
      percent,
      lastPositionSec: input.lastPositionSec,
      completedAt,
    },
    update: { percent, lastPositionSec: input.lastPositionSec, completedAt },
  });

  const stars = await prisma.lessonProgress.count({
    where: { userId: user.sub, completedAt: { not: null } },
  });

  return { progress: toProgressDTO(saved), stars, justCompleted };
}

export function clampReportedPercent(
  reported: number,
  previous: number,
  durationSec: number,
  lastSavedAt?: Date,
  now = Date.now(),
): number {
  // المدة غير معروفة (لم تُحدَّد للحصة) ← لا يمكن الحكم، نقبل القيمة
  if (durationSec <= 0 || reported <= previous) return reported;
  const elapsedSec = lastSavedAt ? Math.max(0, (now - lastSavedAt.getTime()) / 1000) : 0;
  const maxGain = ((elapsedSec * MAX_PLAYBACK_RATE + PROGRESS_SLACK_SEC) / durationSec) * 100;
  return Math.min(reported, previous + maxGain);
}

function toProgressDTO(
  p: { percent: number; lastPositionSec: number; completedAt: Date | null } | null,
): LessonProgressDTO {
  return {
    percent: p?.percent ?? 0,
    lastPositionSec: p?.lastPositionSec ?? 0,
    completedAt: p?.completedAt ? p.completedAt.toISOString() : null,
  };
}

import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import type {
  CourseCreateInput,
  AdminCourseFilter,
  LessonCreateInput,
  AdminCourseDTO,
  AdminLessonDTO,
  CourseListItem,
} from '@miss-ann/shared';
import { z } from 'zod';
import type {
  courseUpdateSchema,
  lessonUpdateSchema,
  attachmentCreateSchema,
} from '@miss-ann/shared';
import { prisma } from '../../lib/prisma.js';
import { assertYouTubeEmbeddable } from '../../lib/youtube.js';
import { badRequest, notFound, paginate } from '../../lib/http.js';
import { auditTx } from '../../lib/audit.js';
import { homeworkFileKeys, removeFiles } from '../homework/homework.admin.service.js';
import { cancelReminders } from '../live/live.service.js';

type CourseUpdateInput = z.infer<typeof courseUpdateSchema>;
type LessonUpdateInput = z.infer<typeof lessonUpdateSchema>;
type AttachmentInput = z.infer<typeof attachmentCreateSchema>;

// ── قائمة كورسات الأدمن (كل الحالات) ────────────────────────────
export async function listAdminCourses(filter: AdminCourseFilter) {
  const where: Prisma.CourseWhereInput = {
    ...(filter.grade && { grade: filter.grade }),
    ...(filter.type && { type: filter.type }),
    ...(filter.term && { term: filter.term }),
    ...(filter.isPublished !== undefined && { isPublished: filter.isPublished }),
    ...(filter.q && { title: { contains: filter.q, mode: 'insensitive' } }),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.course.findMany({
      where,
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      select: {
        id: true,
        title: true,
        grade: true,
        type: true,
        term: true,
        month: true,
        price: true,
        coverImage: true,
        order: true,
        isPublished: true,
        _count: { select: { lessons: true } },
      },
    }),
    prisma.course.count({ where }),
  ]);

  const items = rows.map((c) => ({
    id: c.id,
    title: c.title,
    grade: c.grade,
    type: c.type,
    term: c.term,
    month: c.month,
    price: c.price,
    coverImage: c.coverImage,
    order: c.order,
    isPublished: c.isPublished,
    lessonsCount: c._count.lessons,
  }));

  return paginate(items, total, filter.page, filter.pageSize);
}

// ── تفاصيل كورس كاملة للأدمن (مع الحصص والمرفقات) ────────────────
export async function getAdminCourse(courseId: number): Promise<AdminCourseDTO> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      lessons: {
        orderBy: { order: 'asc' },
        include: { attachments: { select: { id: true, type: true, url: true, title: true } } },
      },
      _count: { select: { lessons: true } },
    },
  });
  if (!course) throw notFound('الكورس غير موجود');

  const lessons: AdminLessonDTO[] = course.lessons.map(toAdminLesson);

  return {
    id: course.id,
    title: course.title,
    description: course.description,
    grade: course.grade,
    type: course.type,
    term: course.term,
    month: course.month,
    price: course.price,
    coverImage: course.coverImage,
    order: course.order,
    isPublished: course.isPublished,
    createdAt: course.createdAt.toISOString(),
    lessonsCount: course._count.lessons,
    lessons,
  };
}

// ── إنشاء/تعديل/حذف كورس ────────────────────────────────────────
// كل كتابة + سطر التدقيق في معاملة واحدة (يُكتبان معاً أو لا شيء)
export async function createCourse(req: Request, data: CourseCreateInput): Promise<CourseListItem> {
  const course = await prisma.$transaction(async (tx) => {
    const c = await tx.course.create({
      data: {
        title: data.title,
        description: data.description,
        grade: data.grade,
        type: data.type,
        term: data.term ?? null,
        month: data.month ?? null,
        price: data.price,
        coverImage: data.coverImage ?? null,
        isPublished: data.isPublished ?? false,
        order: data.order ?? 0,
      },
      include: { _count: { select: { lessons: true } } },
    });
    await auditTx(tx, req, 'COURSE_CREATE', 'Course', { courseId: c.id, title: c.title });
    return c;
  });
  return toListItem(course);
}

export async function updateCourse(
  req: Request,
  courseId: number,
  data: CourseUpdateInput,
): Promise<CourseListItem> {
  await ensureCourse(courseId);
  const course = await prisma.$transaction(async (tx) => {
    const c = await tx.course.update({
      where: { id: courseId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.grade !== undefined && { grade: data.grade }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.term !== undefined && { term: data.term }),
        ...(data.month !== undefined && { month: data.month }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.coverImage !== undefined && { coverImage: data.coverImage }),
        ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
        ...(data.order !== undefined && { order: data.order }),
      },
      include: { _count: { select: { lessons: true } } },
    });
    await auditTx(tx, req, 'COURSE_UPDATE', 'Course', { courseId });
    return c;
  });
  return toListItem(course);
}

export async function setPublish(
  req: Request,
  courseId: number,
  isPublished: boolean,
): Promise<void> {
  await ensureCourse(courseId);
  await prisma.$transaction(async (tx) => {
    await tx.course.update({ where: { id: courseId }, data: { isPublished } });
    await auditTx(tx, req, 'COURSE_PUBLISH', 'Course', { courseId, isPublished });
  });
}

// الحذف يمتد (cascade) لواجبات الكورس وتسليماتها وحصصه اللايف: ملفاتها الخاصة وjobs تذكيرها
// تُجمع داخل نفس المعاملة وتُزال بعد نجاح الـ commit (لا ملفات يتيمة ولا تذكير لحصة محذوفة)
export async function deleteCourse(req: Request, courseId: number): Promise<void> {
  await ensureCourse(courseId);
  const { fileKeys, sessions } = await prisma.$transaction(async (tx) => {
    const keys = await homeworkFileKeys(tx, { courseId });
    const live = await tx.liveSession.findMany({
      where: { courseId },
      select: { id: true, startAt: true },
    });
    await tx.course.delete({ where: { id: courseId } });
    await auditTx(tx, req, 'COURSE_DELETE', 'Course', { courseId });
    return { fileKeys: keys, sessions: live };
  });
  await removeFiles(fileKeys);
  cancelReminders(sessions);
}

// ── الحصص ───────────────────────────────────────────────────────
export async function addLesson(
  req: Request,
  courseId: number,
  data: LessonCreateInput,
): Promise<AdminLessonDTO> {
  await ensureCourse(courseId);
  if (data.videoProvider === 'YOUTUBE' && !data.youtubeVideoId)
    throw badRequest('أدخل رابط فيديو يوتيوب');
  if (data.videoProvider === 'BUNNY' && data.youtubeVideoId && !data.bunnyVideoId) {
    throw badRequest('ارفع فيديو Bunny أولاً');
  }
  if (data.youtubeVideoId) await assertYouTubeEmbeddable(data.youtubeVideoId);
  const lesson = await prisma.$transaction(async (tx) => {
    const l = await tx.lesson.create({
      data: {
        courseId,
        title: data.title,
        order: data.order ?? 0,
        // رابط يوتيوب بدون تحديد المصدر → يوتيوب هو المصدر
        videoProvider: data.videoProvider ?? (data.youtubeVideoId ? 'YOUTUBE' : 'BUNNY'),
        bunnyVideoId: data.bunnyVideoId ?? null,
        youtubeVideoId: data.youtubeVideoId ?? null,
        durationSec: data.durationSec ?? 0,
        isFreePreview: data.isFreePreview ?? false,
      },
      include: { attachments: { select: { id: true, type: true, url: true, title: true } } },
    });
    await auditTx(tx, req, 'LESSON_CREATE', 'Lesson', { courseId, lessonId: l.id });
    return l;
  });
  return toAdminLesson(lesson);
}

export async function updateLesson(
  req: Request,
  lessonId: number,
  data: LessonUpdateInput,
): Promise<void> {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw notFound('الحصة غير موجودة');

  // فحص فيديو يوتيوب الجديد فقط (غير مدرج + التضمين مسموح)
  if (data.youtubeVideoId && data.youtubeVideoId !== lesson.youtubeVideoId) {
    await assertYouTubeEmbeddable(data.youtubeVideoId);
  }
  const youtubeId = data.youtubeVideoId !== undefined ? data.youtubeVideoId : lesson.youtubeVideoId;
  const bunnyId = data.bunnyVideoId !== undefined ? data.bunnyVideoId : lesson.bunnyVideoId;
  if (data.videoProvider === 'YOUTUBE' && !youtubeId) throw badRequest('أدخل رابط فيديو يوتيوب');
  if (data.videoProvider === 'BUNNY' && !bunnyId) throw badRequest('ارفع فيديو Bunny أولاً');

  await prisma.$transaction(async (tx) => {
    await tx.lesson.update({
      where: { id: lessonId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.order !== undefined && { order: data.order }),
        ...(data.videoProvider !== undefined && { videoProvider: data.videoProvider }),
        ...(data.bunnyVideoId !== undefined && { bunnyVideoId: data.bunnyVideoId }),
        ...(data.youtubeVideoId !== undefined && { youtubeVideoId: data.youtubeVideoId }),
        ...(data.durationSec !== undefined && { durationSec: data.durationSec }),
        ...(data.isFreePreview !== undefined && { isFreePreview: data.isFreePreview }),
      },
    });
    await auditTx(tx, req, 'LESSON_UPDATE', 'Lesson', { lessonId, fields: Object.keys(data) });
  });
}

export async function deleteLesson(req: Request, lessonId: number): Promise<void> {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw notFound('الحصة غير موجودة');
  await prisma.$transaction(async (tx) => {
    await tx.lesson.delete({ where: { id: lessonId } });
    await auditTx(tx, req, 'LESSON_DELETE', 'Lesson', { lessonId });
  });
}

// ── ترتيب الحصص داخل كورس (ذرّي) ────────────────────────────────
export async function reorderLessons(
  req: Request,
  courseId: number,
  items: { id: number; order: number }[],
): Promise<void> {
  await ensureCourse(courseId);
  const ids = items.map((i) => i.id);
  const owned = await prisma.lesson.findMany({
    where: { id: { in: ids }, courseId },
    select: { id: true },
  });
  if (owned.length !== ids.length) throw badRequest('بعض الحصص لا تنتمي لهذا الكورس');

  await prisma.$transaction(async (tx) => {
    for (const i of items)
      await tx.lesson.update({ where: { id: i.id }, data: { order: i.order } });
    await auditTx(tx, req, 'LESSON_REORDER', 'Course', { courseId });
  });
}

// ── المرفقات ────────────────────────────────────────────────────
export async function addAttachment(req: Request, lessonId: number, data: AttachmentInput) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw notFound('الحصة غير موجودة');
  return prisma.$transaction(async (tx) => {
    const a = await tx.attachment.create({
      data: { lessonId, type: data.type, url: data.url, title: data.title },
      select: { id: true, type: true, url: true, title: true },
    });
    await auditTx(tx, req, 'ATTACHMENT_CREATE', 'Attachment', { lessonId, attachmentId: a.id });
    return a;
  });
}

export async function deleteAttachment(req: Request, attachmentId: number): Promise<void> {
  const att = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!att) throw notFound('المرفق غير موجود');
  await prisma.$transaction(async (tx) => {
    await tx.attachment.delete({ where: { id: attachmentId } });
    await auditTx(tx, req, 'ATTACHMENT_DELETE', 'Attachment', { attachmentId });
  });
}

// ── أدوات مساعدة ────────────────────────────────────────────────
function toAdminLesson(l: {
  id: number;
  title: string;
  order: number;
  videoProvider: AdminLessonDTO['videoProvider'];
  bunnyVideoId: string | null;
  youtubeVideoId: string | null;
  durationSec: number;
  isFreePreview: boolean;
  attachments: AdminLessonDTO['attachments'];
}): AdminLessonDTO {
  return {
    id: l.id,
    title: l.title,
    order: l.order,
    videoProvider: l.videoProvider,
    bunnyVideoId: l.bunnyVideoId,
    youtubeVideoId: l.youtubeVideoId,
    durationSec: l.durationSec,
    isFreePreview: l.isFreePreview,
    attachments: l.attachments,
  };
}

async function ensureCourse(courseId: number): Promise<void> {
  const exists = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!exists) throw notFound('الكورس غير موجود');
}

function toListItem(c: {
  id: number;
  title: string;
  grade: CourseListItem['grade'];
  type: CourseListItem['type'];
  term: CourseListItem['term'];
  month: number | null;
  price: number;
  coverImage: string | null;
  order: number;
  _count: { lessons: number };
}): CourseListItem {
  return {
    id: c.id,
    title: c.title,
    grade: c.grade,
    type: c.type,
    term: c.term,
    month: c.month,
    price: c.price,
    coverImage: c.coverImage,
    order: c.order,
    lessonsCount: c._count.lessons,
  };
}

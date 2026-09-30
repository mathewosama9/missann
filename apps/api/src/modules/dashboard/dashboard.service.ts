import type { MyCourseDTO, StudentOverviewDTO } from '@miss-ann/shared';
import { prisma } from '../../lib/prisma.js';
import { listExams } from '../exams/exams.service.js';
import { listForStudent } from '../homework/homework.service.js';

// ── لوحة الطالب: كورساتي وتقدّمه، والنظرة العامة ──────────────────
// كل الاستعلامات مقيّدة بـ userId من التوكن (لا معرّف من العميل ← لا IDOR)

// عدد اشتراكات طالب واحد صغير؛ السقف حماية فقط
const MY_COURSES_MAX = 100;

// 3 استعلامات مهما كان عدد الكورسات: الاشتراكات، حصص كورساتها، وتقدّم الطالب في تلك الحصص
export async function listMyCourses(userId: number, now = new Date()): Promise<MyCourseDTO[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId },
    orderBy: { expiresAt: 'desc' },
    take: MY_COURSES_MAX,
    select: {
      source: true,
      expiresAt: true,
      course: { select: { id: true, title: true, coverImage: true, grade: true, type: true } },
    },
  });
  if (enrollments.length === 0) return [];
  const courseIds = enrollments.map((e) => e.course.id);
  const lessons = await prisma.lesson.findMany({
    where: { courseId: { in: courseIds } },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
    select: { id: true, courseId: true },
  });
  const progress = await prisma.lessonProgress.findMany({
    where: { userId, lessonId: { in: lessons.map((l) => l.id) } },
    select: { lessonId: true, completedAt: true, updatedAt: true },
  });
  const byLesson = new Map(progress.map((p) => [p.lessonId, p]));

  const items = enrollments.map((e): MyCourseDTO => {
    const own = lessons.filter((l) => l.courseId === e.course.id);
    const done = own.filter((l) => byLesson.get(l.id)?.completedAt);
    const last = own.reduce<Date | null>((m, l) => {
      const u = byLesson.get(l.id)?.updatedAt;
      return u && (!m || u > m) ? u : m;
    }, null);
    return {
      courseId: e.course.id,
      title: e.course.title,
      coverImage: e.course.coverImage,
      grade: e.course.grade,
      type: e.course.type,
      source: e.source,
      expiresAt: e.expiresAt.toISOString(),
      active: e.expiresAt > now,
      lessonsCount: own.length,
      completedLessons: done.length,
      percent: own.length ? Math.round((done.length / own.length) * 100) : 0,
      nextLessonId: own.find((l) => !byLesson.get(l.id)?.completedAt)?.id ?? null,
      lastWatchedAt: last?.toISOString() ?? null,
    };
  });
  // الساري أولاً، ثم آخر ما شوهد
  return items.sort((a, b) => Number(b.active) - Number(a.active) || (b.lastWatchedAt ?? '').localeCompare(a.lastWatchedAt ?? ''));
}

const OVERVIEW_COURSES = 4;
const OVERVIEW_RESULTS = 3;

// النتائج والامتحانات القادمة من listExams نفسها ← نفس قواعد الوصول وإظهار الدرجة (لا تسريب قبل الإعلان)
export async function getOverview(userId: number): Promise<StudentOverviewDTO> {
  const now = new Date();
  const [courses, wallet, stars, last, exams, homework] = await Promise.all([
    listMyCourses(userId, now),
    prisma.wallet.findUnique({ where: { userId }, select: { balance: true } }),
    prisma.lessonProgress.count({ where: { userId, completedAt: { not: null } } }),
    prisma.lessonProgress.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { percent: true, updatedAt: true, lesson: { select: { id: true, title: true, course: { select: { id: true, title: true } } } } },
    }),
    listExams(userId),
    listForStudent(userId, { tab: 'REQUIRED', page: 1, pageSize: 1 }),
  ]);
  const active = courses.filter((c) => c.active);

  const recentResults = exams
    .filter((e) => e.attempt?.resultState === 'VISIBLE' && e.attempt.score !== null)
    .sort((a, b) => (b.attempt!.submittedAt ?? '').localeCompare(a.attempt!.submittedAt ?? ''))
    .slice(0, OVERVIEW_RESULTS)
    .map((e) => ({
      attemptId: e.attempt!.id,
      examId: e.id,
      title: e.title,
      score: e.attempt!.score!,
      totalPoints: e.attempt!.totalPoints,
      submittedAt: e.attempt!.submittedAt,
    }));

  return {
    balance: wallet?.balance ?? 0,
    stars,
    activeCourses: active.slice(0, OVERVIEW_COURSES),
    activeCoursesCount: active.length,
    lastLesson: last && {
      lessonId: last.lesson.id,
      lessonTitle: last.lesson.title,
      courseId: last.lesson.course.id,
      courseTitle: last.lesson.course.title,
      percent: last.percent,
      updatedAt: last.updatedAt.toISOString(),
    },
    recentResults,
    upcomingExams: exams.filter((e) => e.state === 'OPEN' || e.state === 'UPCOMING').length,
    requiredHomework: homework.counts.REQUIRED,
  };
}

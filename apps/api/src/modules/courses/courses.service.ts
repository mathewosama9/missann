import type { Prisma } from '@prisma/client';
import type {
  CourseFilter,
  CourseListItem,
  CourseDetailDTO,
  LessonPlaybackDTO,
  JwtPayload,
} from '@miss-ann/shared';
import { prisma } from '../../lib/prisma.js';
import { notFound, unauthorized, paginate } from '../../lib/http.js';
import { isStaff, activeVideo } from '../lessons/lessons.service.js';
import { isEnrolled, findActiveEnrollment, assertEnrollment } from './enrollment.service.js';

// ── كتالوج عام: الكورسات المنشورة فقط مع فلترة + ترقيم ──────────
export async function listCourses(filter: CourseFilter) {
  const where: Prisma.CourseWhereInput = {
    isPublished: true,
    ...(filter.grade && { grade: filter.grade }),
    ...(filter.type && { type: filter.type }),
    ...(filter.term && { term: filter.term }),
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
        _count: { select: { lessons: true } },
      },
    }),
    prisma.course.count({ where }),
  ]);

  const items: CourseListItem[] = rows.map((c) => ({
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
  }));

  return paginate(items, total, filter.page, filter.pageSize);
}

// ── تفاصيل كورس منشور + قائمة الحصص (بدون مراجع تشغيل) ──────────
export async function getCourseDetail(
  courseId: number,
  userId?: number,
): Promise<CourseDetailDTO> {
  const course = await prisma.course.findFirst({
    where: { id: courseId, isPublished: true },
    include: {
      lessons: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          title: true,
          order: true,
          durationSec: true,
          isFreePreview: true,
          _count: { select: { attachments: true } },
        },
      },
      _count: { select: { lessons: true } },
    },
  });
  if (!course) throw notFound('الكورس غير موجود');

  const enrollment = userId ? await findActiveEnrollment(userId, courseId) : null;
  const enrolled = enrollment !== null;

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
    lessonsCount: course._count.lessons,
    enrolled,
    enrollmentExpiresAt: enrollment ? enrollment.expiresAt.toISOString() : null,
    lessons: course.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      order: l.order,
      durationSec: l.durationSec,
      isFreePreview: l.isFreePreview,
      locked: !l.isFreePreview && !enrolled,
      attachmentsCount: l._count.attachments,
    })),
  };
}

// ── مرجع حصة قابلة للوصول (معاينة مجانية أو مشترك ساري أو طاقم) ──
// لا يُرجع معرّف الفيديو الخام؛ التشغيل عبر رابط موقّع من /lessons/:id/play
export async function getAccessibleLesson(
  courseId: number,
  lessonId: number,
  user?: JwtPayload,
): Promise<LessonPlaybackDTO> {
  const staff = user ? isStaff(user.role) : false;
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, courseId, ...(!staff && { course: { isPublished: true } }) },
    include: {
      attachments: { select: { id: true, type: true, url: true, title: true } },
    },
  });
  if (!lesson) throw notFound('الحصة غير موجودة');

  // المعاينة المجانية متاحة للجميع؛ غير ذلك يتطلب اشتراكاً سارياً
  if (!lesson.isFreePreview && !staff) {
    if (!user) throw unauthorized('يجب تسجيل الدخول والاشتراك للوصول لهذه الحصة');
    await assertEnrollment(user.sub, courseId);
  }

  return {
    id: lesson.id,
    courseId: lesson.courseId,
    title: lesson.title,
    durationSec: lesson.durationSec,
    isFreePreview: lesson.isFreePreview,
    hasVideo: activeVideo(lesson) !== null,
    attachments: lesson.attachments,
  };
}

export { isEnrolled };

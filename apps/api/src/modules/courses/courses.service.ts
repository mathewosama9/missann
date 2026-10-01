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
import { bumpCacheGeneration, cacheGeneration, cached } from '../../lib/cache.js';

// ── كاش الكتالوج العام (Redis، 60 ثانية) ─────────────────────────
// كل كتابة أدمن على الكورسات/الحصص/المرفقات ترفع الإصدار ← النشر/التعديل يظهر فوراً بلا انتظار المهلة
const CATALOG = 'catalog';
const CATALOG_TTL_SEC = 60;
export const bumpCatalog = (): Promise<unknown> => bumpCacheGeneration(CATALOG);

// ── كتالوج عام: الكورسات المنشورة فقط مع فلترة + ترقيم ──────────
// البحث النصي (q) لا يُخزَّن: مفاتيح كثيرة نادرة التكرار
export async function listCourses(filter: CourseFilter) {
  if (filter.q) return queryCourses(filter);
  const gen = await cacheGeneration(CATALOG);
  const key = `${CATALOG}:${gen}:list:${filter.grade ?? ''}:${filter.type ?? ''}:${filter.term ?? ''}:${filter.page}:${filter.pageSize}`;
  return cached(key, CATALOG_TTL_SEC, () => queryCourses(filter));
}

async function queryCourses(filter: CourseFilter) {
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
  // الجزء العام (الكورس وحصصه) من الكاش؛ حالة اشتراك المستخدم تُحسب لكل طلب
  const gen = await cacheGeneration(CATALOG);
  const published = await cached(`${CATALOG}:${gen}:course:${courseId}`, CATALOG_TTL_SEC, () => loadCourse(courseId, true));
  const enrollment = userId ? await findActiveEnrollment(userId, courseId) : null;
  // كورس مخفي: يظهر لمشتركه الساري فقط (يكمل ما دفع فيه)، ولغيره 404
  const course = published ?? (enrollment ? await loadCourse(courseId, false) : null);
  if (!course) throw notFound('الكورس غير موجود');

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

// حقول مختارة (نصوص/أرقام فقط) ← تسلسل JSON في الكاش يعيدها كما هي
function loadCourse(courseId: number, publishedOnly: boolean) {
  return prisma.course.findFirst({
    where: { id: courseId, ...(publishedOnly && { isPublished: true }) },
    select: {
      id: true,
      title: true,
      description: true,
      grade: true,
      type: true,
      term: true,
      month: true,
      price: true,
      coverImage: true,
      order: true,
      isPublished: true,
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
    where: { id: lessonId, courseId },
    include: {
      attachments: { select: { id: true, type: true, url: true, title: true } },
      course: { select: { isPublished: true } },
    },
  });
  if (!lesson) throw notFound('الحصة غير موجودة');
  // كورس مخفي: لمشتركه الساري فقط (حتى المعاينة المجانية لا تظهر لغيره)
  if (!staff && !lesson.course.isPublished && !(user && (await isEnrolled(user.sub, courseId)))) {
    throw notFound('الحصة غير موجودة');
  }

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

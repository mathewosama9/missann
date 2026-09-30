import type { CourseType, EnrollmentSource, Prisma } from '@prisma/client';
import { ENROLLMENT_DAYS } from '@miss-ann/shared';
import { prisma } from '../../lib/prisma.js';
import { forbidden } from '../../lib/http.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// بوابة الوصول: يتحقق وجود اشتراك ساري المفعول للمستخدم في الكورس
export async function findActiveEnrollment(userId: number, courseId: number) {
  return prisma.enrollment.findFirst({
    where: { userId, courseId, expiresAt: { gt: new Date() } },
  });
}

export async function isEnrolled(userId: number, courseId: number): Promise<boolean> {
  return (await findActiveEnrollment(userId, courseId)) !== null;
}

// يرمي 403 إن لم يوجد اشتراك ساري — يُستخدم قبل أي تسليم فيديو/مرفق
export async function assertEnrollment(userId: number, courseId: number): Promise<void> {
  const enrollment = await findActiveEnrollment(userId, courseId);
  if (!enrollment) throw forbidden('يجب الاشتراك في الكورس للوصول لهذا المحتوى');
}

// انتهاء الاشتراك الجديد: يُضاف للمدة المتبقية إن وُجدت = max(الآن، الانتهاء الحالي) + مدة النوع
export function nextExpiry(type: CourseType, currentExpiry: Date | null, now = new Date()): Date {
  const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
  return new Date(base.getTime() + ENROLLMENT_DAYS[type] * DAY_MS);
}

// إنشاء/تمديد اشتراك داخل معاملة. المستدعي يقفل محفظة المستخدم أولاً (lockWallet)
// فتتسلسل كل عمليات الاشتراك لنفس الطالب ولا يضيع تمديد بسبب قراءتين متزامنتين.
export async function grantEnrollment(
  tx: Prisma.TransactionClient,
  userId: number,
  course: { id: number; type: CourseType },
  source: EnrollmentSource,
) {
  const existing = await tx.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: course.id } },
  });
  const expiresAt = nextExpiry(course.type, existing?.expiresAt ?? null);
  return tx.enrollment.upsert({
    where: { userId_courseId: { userId, courseId: course.id } },
    create: { userId, courseId: course.id, source, expiresAt },
    update: { source, expiresAt },
  });
}

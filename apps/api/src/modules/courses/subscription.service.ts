import type { Request } from 'express';
import type { SubscribeResultDTO } from '@miss-ann/shared';
import { LOCKED_TX, prisma } from '../../lib/prisma.js';
import { conflict, notFound } from '../../lib/http.js';
import { auditTx } from '../../lib/audit.js';
import { debitWallet, insufficientBalance, lockWallet } from '../wallet/wallet.service.js';
import { grantEnrollment } from './enrollment.service.js';

// ── الاشتراك بالمحفظة: قفل المحفظة ← فحص الرصيد ← خصم ← إنشاء/تمديد الاشتراك ← AuditLog ─
export async function subscribeWithWallet(
  req: Request,
  userId: number,
  courseId: number,
): Promise<SubscribeResultDTO> {
  const course = await prisma.course.findFirst({
    where: { id: courseId, isPublished: true },
    select: { id: true, title: true, type: true, price: true },
  });
  if (!course) throw notFound('الكورس غير موجود');

  return prisma.$transaction(async (tx) => {
    const wallet = await lockWallet(tx, userId);

    // الشهري يُجدَّد (يمتد)، أما الشراء لمرة واحدة فلا يُكرَّر وهو ساري
    const active = await tx.enrollment.findFirst({
      where: { userId, courseId, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (active && course.type !== 'MONTHLY') throw conflict('أنت مشترك بالفعل في هذا الكورس');

    let balance = wallet.balance;
    if (course.price > 0) {
      if (wallet.balance < course.price) throw insufficientBalance();
      balance = await debitWallet(tx, wallet.id, course.price, `course:${course.id}`, `اشتراك: ${course.title}`);
    }

    const source = course.price > 0 ? 'WALLET' : 'FREE';
    const enrollment = await grantEnrollment(tx, userId, course, source);
    await auditTx(tx, req, active ? 'SUBSCRIPTION_RENEW' : 'SUBSCRIPTION_CREATE', 'Enrollment', {
      courseId,
      source,
      charged: course.price,
      expiresAt: enrollment.expiresAt.toISOString(),
      balance,
    });

    return {
      courseId,
      expiresAt: enrollment.expiresAt.toISOString(),
      balance,
      charged: course.price,
    };
  }, LOCKED_TX);
}

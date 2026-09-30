import crypto from 'node:crypto';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import type { PaymentDTO, PaymentInitDTO, PaymobInitInput } from '@miss-ann/shared';
import { LOCKED_TX, prisma } from '../../lib/prisma.js';
import { env } from '../../lib/env.js';
import { logger } from '../../lib/logger.js';
import { audit, auditTx } from '../../lib/audit.js';
import { AppError, badRequest, conflict, notFound, unauthorized } from '../../lib/http.js';
import { assertPaymobConfigured, createPaymobCheckout, verifyTransactionHmac } from '../../lib/paymob.js';
import { creditWallet, lockWallet } from '../wallet/wallet.service.js';
import { grantEnrollment } from '../courses/enrollment.service.js';

// ── بدء دفع أونلاين: Payment=PENDING ثم طلب Paymob ← رابط iframe ────
export async function initPaymob(req: Request, userId: number, input: PaymobInitInput): Promise<PaymentInitDTO> {
  assertPaymobConfigured();

  let amount: number;
  let courseId: number | null = null;
  if (input.courseId !== undefined) {
    const course = await prisma.course.findFirst({
      where: { id: input.courseId, isPublished: true },
      select: { id: true, type: true, price: true },
    });
    if (!course) throw notFound('الكورس غير موجود');
    if (course.price <= 0) throw badRequest('هذا الكورس مجاني — اشترك مباشرة');
    if (course.type !== 'MONTHLY') {
      const active = await prisma.enrollment.findFirst({
        where: { userId, courseId: course.id, expiresAt: { gt: new Date() } },
        select: { id: true },
      });
      if (active) throw conflict('أنت مشترك بالفعل في هذا الكورس');
    }
    amount = course.price;
    courseId = course.id;
  } else {
    amount = input.topupAmount!;
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, phone: true, email: true },
  });
  const payment = await prisma.payment.create({
    data: { userId, amount, purpose: courseId ? 'COURSE' : 'TOPUP', courseId, provider: 'PAYMOB' },
  });

  try {
    const [firstName, ...rest] = user.name.trim().split(/\s+/);
    const checkout = await createPaymobCheckout({
      amountCents: amount,
      // فريد على حساب Paymob حتى مع أكثر من بيئة
      merchantOrderId: `${payment.id}-${crypto.randomBytes(4).toString('hex')}`,
      billing: {
        firstName: firstName || 'NA',
        lastName: rest.join(' ') || 'NA',
        phone: `+2${user.phone}`,
        email: user.email ?? 'NA',
      },
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { providerRef: checkout.orderId } });
    await audit(req, 'PAYMENT_INIT', 'Payment', { paymentId: payment.id, amount, courseId });
    return { paymentId: payment.id, iframeUrl: checkout.iframeUrl };
  } catch (err) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    throw err;
  }
}

// ── Webhook: HMAC أولاً ← قفل الدفعة ← idempotent ← شحن المحفظة أو تفعيل الاشتراك ─
interface PaymobTransaction {
  id?: number | string;
  success?: boolean;
  pending?: boolean;
  is_voided?: boolean;
  is_refunded?: boolean;
  amount_cents?: number | string;
  currency?: string;
  order?: { id?: number | string };
}

export type WebhookOutcome = 'paid' | 'failed' | 'pending' | 'duplicate' | 'unknown' | 'ignored';

export async function handlePaymobWebhook(
  req: Request,
  body: { type?: string; obj?: PaymobTransaction } | undefined,
  hmac: unknown,
): Promise<WebhookOutcome> {
  if (!env.PAYMOB_HMAC_SECRET) {
    throw new AppError(503, 'الدفع الأونلاين غير مهيّأ', 'PAYMENT_UNCONFIGURED');
  }
  const obj = body?.obj;
  if (!obj || typeof obj !== 'object') throw badRequest('إشعار غير صالح');

  // التوقيع قبل أي قراءة/كتابة
  if (!verifyTransactionHmac(obj, hmac, env.PAYMOB_HMAC_SECRET)) {
    logger.warn({ ip: req.ip, orderId: obj.order?.id }, 'Paymob webhook بتوقيع غير صالح');
    await audit(req, 'PAYMOB_WEBHOOK_FORGED', 'Payment', { orderId: obj.order?.id ?? null });
    throw unauthorized('توقيع غير صالح');
  }
  if (body?.type && body.type !== 'TRANSACTION') return 'ignored';

  const orderId = String(obj.order?.id ?? '');
  const txnId = String(obj.id ?? '');
  if (!orderId || !txnId) throw badRequest('إشعار غير صالح');

  try {
    return await prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM "Payment" WHERE "providerRef" = ${orderId} FOR UPDATE`;
      if (!locked) {
        logger.warn({ orderId }, 'Paymob webhook لطلب غير معروف');
        return 'unknown';
      }
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: locked.id },
        include: { course: { select: { id: true, type: true, title: true } } },
      });

      // نفس الإشعار ← لا شيء (لا شحن مرتين)
      if (payment.providerTxnId === txnId && !(payment.status === 'PAID' && obj.is_refunded === true)) {
        return 'duplicate';
      }
      if (payment.status === 'PAID') {
        // الدفعة مدفوعة بالفعل: استرداد من لوحة Paymob، أو معاملة ناجحة ثانية على نفس الطلب
        // (خصم مزدوج على الطالب) ← لا تغيير آلي، لكن يُسجَّل للتسوية اليدوية بدل التجاهل الصامت
        const refunded = obj.is_refunded === true || obj.is_voided === true;
        if (refunded || obj.success === true) {
          const action = refunded ? 'PAYMOB_REFUND_NOTIFIED' : 'PAYMOB_EXTRA_TXN';
          logger.error({ paymentId: payment.id, txnId, action }, 'Paymob: إشعار على دفعة مدفوعة — مراجعة يدوية');
          await auditTx(tx, req, action, 'Payment', {
            paymentId: payment.id,
            txnId,
            userId: payment.userId,
            amountCents: obj.amount_cents ?? null,
          });
        }
        return 'duplicate';
      }
      if (obj.pending === true) return 'pending';

      const amountOk = Number(obj.amount_cents) === payment.amount && obj.currency === 'EGP';
      const succeeded = obj.success === true && obj.is_voided !== true && obj.is_refunded !== true;

      if (!succeeded || !amountOk) {
        // FAILED قابلة للتحوّل لـ PAID لو نجحت محاولة لاحقة على نفس الطلب
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', providerTxnId: txnId } });
        await auditTx(tx, req, succeeded ? 'PAYMOB_AMOUNT_MISMATCH' : 'PAYMENT_FAILED', 'Payment', {
          paymentId: payment.id,
          txnId,
          amountCents: obj.amount_cents ?? null,
        });
        if (succeeded) logger.error({ paymentId: payment.id, txnId }, 'Paymob: مبلغ مختلف عن الدفعة — مراجعة يدوية');
        return 'failed';
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'PAID', providerTxnId: txnId, paidAt: new Date() },
      });
      const wallet = await lockWallet(tx, payment.userId);

      // كورس لمرة واحدة صار ساري أثناء الدفع (دفعتان معلّقتان، أو محفظة ثم أونلاين) ← لا تمديد عام
      // إضافي على الطالب؛ المبلغ يذهب للمحفظة. الشهري يُجدَّد عادي.
      const alreadyOwned =
        payment.course !== null &&
        payment.course.type !== 'MONTHLY' &&
        (await tx.enrollment.count({
          where: { userId: payment.userId, courseId: payment.course.id, expiresAt: { gt: new Date() } },
        })) > 0;

      if (payment.purpose === 'COURSE' && payment.course && !alreadyOwned) {
        const enrollment = await grantEnrollment(tx, payment.userId, payment.course, 'ONLINE');
        await auditTx(tx, req, 'PAYMENT_PAID', 'Payment', {
          paymentId: payment.id,
          txnId,
          userId: payment.userId,
          courseId: payment.course.id,
          expiresAt: enrollment.expiresAt.toISOString(),
        });
      } else {
        // شحن، أو كورس حُذف/مملوك بالفعل ← المبلغ يُضاف للمحفظة ولا يضيع
        const note =
          payment.purpose !== 'COURSE'
            ? 'شحن أونلاين'
            : alreadyOwned
              ? 'دفع لكورس مشترك فيه بالفعل — أُضيف للمحفظة'
              : 'دفع لكورس غير متاح — أُضيف للمحفظة';
        const balance = await creditWallet(tx, wallet.id, payment.amount, 'TOPUP', `payment:${payment.id}`, note);
        await auditTx(tx, req, 'PAYMENT_PAID', 'Payment', {
          paymentId: payment.id,
          txnId,
          userId: payment.userId,
          amount: payment.amount,
          balance,
        });
      }
      return 'paid';
    }, LOCKED_TX);
  } catch (err) {
    // نفس رقم المعاملة وصل متزامناً لدفعة أخرى/نفسها ← تكرار
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 'duplicate';
    throw err;
  }
}

// ── حالة دفعة يملكها الطالب (صفحة نتيجة الدفع) ────────────────────
export async function getOwnPayment(userId: number, paymentId: number): Promise<PaymentDTO> {
  const p = await prisma.payment.findFirst({
    where: { id: paymentId, userId },
    include: { course: { select: { title: true } } },
  });
  if (!p) throw notFound('الدفعة غير موجودة');
  return toPaymentDTO(p);
}

export function toPaymentDTO(p: {
  id: number;
  amount: number;
  status: PaymentDTO['status'];
  purpose: PaymentDTO['purpose'];
  courseId: number | null;
  course: { title: string } | null;
  createdAt: Date;
  paidAt: Date | null;
}): PaymentDTO {
  return {
    id: p.id,
    amount: p.amount,
    status: p.status,
    purpose: p.purpose,
    courseId: p.courseId,
    courseTitle: p.course?.title ?? null,
    createdAt: p.createdAt.toISOString(),
    paidAt: p.paidAt ? p.paidAt.toISOString() : null,
  };
}

// ── كنّاس: دفعات PENDING أقدم من صلاحية مفتاح الدفع ← FAILED ─────────
// آمن: لو وصل webhook ناجح متأخراً، FAILED ← PAID ما زال مسموحاً (لا يضيع مال).
export const STALE_PENDING_MS = 2 * 60 * 60 * 1000; // مفتاح Paymob صالح ساعة واحدة

export async function expireStalePayments(now = new Date()): Promise<number> {
  const stale = await prisma.payment.findMany({
    where: { status: 'PENDING', createdAt: { lt: new Date(now.getTime() - STALE_PENDING_MS) } },
    select: { id: true },
    take: 500,
  });
  if (stale.length === 0) return 0;
  const ids = stale.map((p) => p.id);
  const { count } = await prisma.payment.updateMany({
    where: { id: { in: ids }, status: 'PENDING' },
    data: { status: 'FAILED' },
  });
  await audit(null, 'PAYMENT_EXPIRED', 'Payment', { paymentIds: ids, count });
  return count;
}

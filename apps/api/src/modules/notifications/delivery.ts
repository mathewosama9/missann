import { UnrecoverableError, type Job } from 'bullmq';
import { isProd } from '../../lib/env.js';
import { prisma } from '../../lib/prisma.js';
import { devLogProvider, ProviderError, PROVIDER_TIMEOUT_MS, safeError, type MessageProvider } from '../../lib/messaging.js';
import { whatsappProvider } from '../../lib/whatsapp.js';
import { smsProvider } from '../../lib/sms.js';
import { OTP_MASK, unlocked } from './outbox.js';

// ── تسليم رسالة صادرة واحدة (طابور messages) ─────────────────────
// واتساب أولاً ثم SMS كبديل داخل نفس المحاولة؛ فشل الاثنين ← إعادة محاولة بـ backoff،
// والمحاولة الأخيرة (أو خطأ دائم) تُعلِّم FAILED مع آخر خطأ.

// حجز يغطي مهلتي المزوّدين + هامش: عامل توقف فجأة ← الحجز ينتهي ويُستعاد
const LOCK_MS = PROVIDER_TIMEOUT_MS * 2 + 30_000;

// التطوير بلا مفاتيح: مزوّد السجل؛ الإنتاج بلا مفاتيح: لا مزوّد (فشل دائم يظهر في سجل الرسائل)
const configured = [whatsappProvider, smsProvider].filter((p): p is MessageProvider => p !== null);
export const providers: readonly MessageProvider[] = configured.length || isProd ? configured : [devLogProvider];

export type DeliverJobData = { id: number; code?: string };

async function finish(id: number, data: { status: 'SENT' | 'FAILED' | 'PENDING'; lastError: string | null; channel?: 'WHATSAPP' | 'SMS'; providerMessageId?: string }) {
  await prisma.notification.updateMany({
    where: { id, status: 'PENDING' },
    data: { ...data, lockedUntil: null, ...(data.status === 'SENT' && { sentAt: new Date() }) },
  });
}

export async function deliverMessageJob(job: Pick<Job<DeliverJobData>, 'data' | 'attemptsMade' | 'opts'>) {
  const { id, code } = job.data;
  const now = new Date();
  // حجز ذرّي: PENDING وغير محجوز ← عامل واحد فقط يرسل؛ SENT/FAILED أو محجوز ← لا شيء (idempotent)
  const { count } = await prisma.notification.updateMany({
    where: { id, status: 'PENDING', channel: { not: 'IN_APP' }, ...unlocked(now) },
    data: { lockedUntil: new Date(now.getTime() + LOCK_MS), attempts: { increment: 1 } },
  });
  if (count === 0) return { skipped: true };

  const n = await prisma.notification.findUniqueOrThrow({ where: { id }, select: { type: true, toPhone: true, body: true } });
  const sensitive = n.type === 'OTP';
  if (sensitive && !code) {
    await finish(id, { status: 'FAILED', lastError: 'كود التحقق غير متاح (لا يُخزَّن) — يطلب المستخدم كوداً جديداً' });
    return { failed: true };
  }
  const text = sensitive ? n.body.replace(OTP_MASK, code!) : n.body;

  const errors: string[] = [];
  let retryable = false;
  for (const p of providers) {
    try {
      const providerMessageId = await p.send(n.toPhone!, text, { sensitive });
      // نجاح البديل يُبقي سبب فشل الأساسي للمتابعة
      await finish(id, { status: 'SENT', channel: p.channel, providerMessageId, lastError: errors.join(' | ') || null });
      return { sent: p.name };
    } catch (err) {
      const e = err instanceof ProviderError ? err : new ProviderError(safeError((err as Error).message), true);
      errors.push(e.message);
      retryable ||= e.retryable;
    }
  }
  if (providers.length === 0) errors.push('لا يوجد مزوّد رسائل مهيّأ (WHATSAPP_* / SMS_*)');

  const lastError = errors.join(' | ').slice(0, 500);
  const final = !retryable || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
  await finish(id, { status: final ? 'FAILED' : 'PENDING', lastError });
  // خطأ دائم ← لا إعادة محاولة؛ مؤقت ← BullMQ يعيد بعد backoff
  throw retryable ? new Error(lastError) : new UnrecoverableError(lastError);
}

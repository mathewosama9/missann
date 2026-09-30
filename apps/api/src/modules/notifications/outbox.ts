import type { NotifType, Prisma } from '@prisma/client';
import { egyptianPhone, renderTemplate } from '@miss-ann/shared';
import { prisma } from '../../lib/prisma.js';
import { enqueue, enqueueBulk, JOBS } from '../../lib/queue.js';
import { OTP_TTL_MIN } from '../../lib/otp.js';
import type { TemplateText } from './templates.js';

// ── outbox الإشعارات: المنتجون يكتبون الصفوف ثم يدفعون للطابور (بلا انتظار الإرسال) ──
// الضمان: jobId ثابت لكل رسالة + حجز الحالة PENDING في العامل ← لا إرسال مكرر مهما أعيد الدفع.

// حجم دفعة التوزيع: createMany + addBulk لكل دفعة (لا تحميل كل المستخدمين في الذاكرة)
export const FANOUT_CHUNK = 500;
// نص رسالة كود التحقق في القاعدة: الكود لا يُخزَّن، يصل للعامل في بيانات الـ job فقط
export const OTP_MASK = '••••••';
// رسالة PENDING أقدم من هذا ولم تُحجز ← الكنّاس يعيد دفعها (الدفع المكرر يُتجاهل بالـ jobId)
const STALE_MS = 2 * 60_000;

export const messageJobId = (id: number) => `msg-${id}`;
export const broadcastJobId = (id: number) => `broadcast-${id}`;

const isPhone = (p: string) => egyptianPhone.safeParse(p).success;

export function dispatchMessages(ids: number[]): Promise<boolean> {
  return enqueueBulk(
    'messages',
    ids.map((id) => ({ name: JOBS.deliverMessage, data: { id }, opts: { jobId: messageJobId(id) } })),
  );
}

export function queueBroadcast(broadcastId: number): Promise<boolean> {
  return enqueue('notifications', JOBS.broadcast, { broadcastId }, { jobId: broadcastJobId(broadcastId) });
}

export interface Recipient {
  userId: number;
  name: string;
  phone: string;
  // أساس مفتاح منع التكرار لهذا المستلم (يُضاف له اسم القناة)
  key: string;
  vars?: Record<string, string | number>;
}

export interface FanOutMessage {
  type: NotifType;
  inApp?: TemplateText;
  whatsapp?: TemplateText;
  vars?: Record<string, string | number>;
  broadcastId?: number;
}

type Channel = 'IN_APP' | 'WHATSAPP';

function renderRows(recipients: Recipient[], m: FanOutMessage, text: TemplateText, channel: Channel) {
  return recipients.map((r) => {
    const vars = { ...m.vars, ...r.vars, name: r.name };
    return {
      userId: r.userId,
      type: m.type,
      channel,
      broadcastId: m.broadcastId ?? null,
      dedupeKey: `${r.key}:${channel}`,
      title: renderTemplate(text.title, vars).slice(0, 160),
      body: renderTemplate(text.body, vars).slice(0, 2000),
    };
  });
}

// دفعة واحدة من المستلمين: إشعارات داخلية (createMany) + رسائل واتساب (createManyAndReturn ثم addBulk).
// skipDuplicates على dedupeKey ← إعادة تشغيل الـ job لا تكرر شيئاً ولا تعيد دفع ما دُفع.
export async function fanOut(recipients: Recipient[], m: FanOutMessage): Promise<void> {
  if (recipients.length === 0) return;
  if (m.inApp) {
    await prisma.notification.createMany({ data: renderRows(recipients, m, m.inApp, 'IN_APP'), skipDuplicates: true });
  }
  if (m.whatsapp) {
    const reachable = recipients.filter((r) => isPhone(r.phone));
    const rows = renderRows(reachable, m, m.whatsapp, 'WHATSAPP').map((row, i) => ({
      ...row,
      status: 'PENDING' as const,
      toPhone: reachable[i]!.phone,
    }));
    const created = await prisma.notification.createManyAndReturn({ data: rows, skipDuplicates: true, select: { id: true } });
    await dispatchMessages(created.map((c) => c.id));
  }
}

// الحجز منتهٍ أو غير موجود
export const unlocked = (now: Date): Prisma.NotificationWhereInput => ({
  OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
});

// كنّاس دوري: رسائل لم تصل للطابور (Redis كان متوقفاً)، بث لم يكتمل توزيعه، وأكواد تحقق انتهت قبل الإرسال
export async function flushNotificationOutbox(limit = 500): Promise<{ messages: number; broadcasts: number; expiredOtp: number }> {
  const now = new Date();
  const outbound = { status: 'PENDING', channel: { not: 'IN_APP' } } as const;
  // كود التحقق لا يُعاد دفعه (غير مخزَّن) — يُغلق بعد انتهاء صلاحيته
  const { count: expiredOtp } = await prisma.notification.updateMany({
    where: { ...outbound, type: 'OTP', createdAt: { lt: new Date(now.getTime() - OTP_TTL_MIN * 60_000) }, ...unlocked(now) },
    data: { status: 'FAILED', lastError: 'انتهت صلاحية الكود قبل الإرسال' },
  });
  const pending = await prisma.notification.findMany({
    where: { ...outbound, type: { not: 'OTP' }, createdAt: { lt: new Date(now.getTime() - STALE_MS) }, ...unlocked(now) },
    orderBy: { id: 'asc' },
    take: limit,
    select: { id: true },
  });
  if (pending.length) await dispatchMessages(pending.map((p) => p.id));
  const broadcasts = await prisma.notificationBroadcast.findMany({
    where: { completedAt: null, createdAt: { lt: new Date(now.getTime() - 60_000) } },
    orderBy: { id: 'asc' },
    take: 20,
    select: { id: true },
  });
  for (const b of broadcasts) await queueBroadcast(b.id);
  return { messages: pending.length, broadcasts: broadcasts.length, expiredOtp };
}

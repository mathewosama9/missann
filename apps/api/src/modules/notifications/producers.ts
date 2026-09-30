import type { Job } from 'bullmq';
import type { NotificationBroadcast } from '@prisma/client';
import { EXPIRY_WARN_DAYS, egyptianPhone, renderTemplate } from '@miss-ann/shared';
import { prisma } from '../../lib/prisma.js';
import { enqueue, JOBS } from '../../lib/queue.js';
import { loadTemplate } from './templates.js';
import { dispatchMessages, fanOut, FANOUT_CHUNK, messageJobId, OTP_MASK, type Recipient } from './outbox.js';

// ── منتجو الإشعارات: ينشئون الصفوف ويدفعون التسليم للطابور — لا إرسال داخل الطلب ──

const CAIRO = 'Africa/Cairo';
const cairoTime = (d: Date) => d.toLocaleTimeString('ar-EG', { timeZone: CAIRO, hour: 'numeric', minute: '2-digit' });
const cairoDate = (d: Date) => d.toLocaleDateString('ar-EG', { timeZone: CAIRO, weekday: 'long', day: 'numeric', month: 'long' });

const userSelect = { id: true, name: true, phone: true } as const;

// ── كود التحقق: الصف بنص مُقنَّع، والكود في بيانات الـ job فقط (تُحذف فور الانتهاء) ──
export async function queueOtpMessage(userId: number, phone: string, code: string): Promise<boolean> {
  const tpl = (await loadTemplate('otp')).WHATSAPP!;
  const n = await prisma.notification.create({
    data: {
      userId,
      type: 'OTP',
      channel: 'WHATSAPP',
      status: 'PENDING',
      toPhone: phone,
      title: tpl.title,
      body: renderTemplate(tpl.body, { code: OTP_MASK }),
    },
    select: { id: true },
  });
  // الكود صالح 10 دقائق ← إعادة محاولة سريعة، ولا يبقى الـ job (ببياناته) في Redis بعد انتهائه
  return enqueue('messages', JOBS.deliverMessage, { id: n.id, code }, {
    jobId: messageJobId(n.id),
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: true,
    removeOnFail: true,
  });
}

// ── نتيجة الامتحان لولي الأمر ────────────────────────────────────
// idempotent: parentNotifiedAt (مرة لكل محاولة) + dedupeKey، في معاملة واحدة مع إنشاء الرسالة
export async function parentExamResultJob(job: Job<{ attemptId: number }>) {
  const { attemptId } = job.data;
  const a = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    select: {
      score: true,
      totalPoints: true,
      status: true,
      gradedAt: true,
      user: { select: { id: true, name: true, parentPhone: true } },
      exam: { select: { title: true, notifyParent: true } },
    },
  });
  if (!a || a.status === 'IN_PROGRESS' || !a.gradedAt || !a.exam.notifyParent) return { skipped: true };
  if (!egyptianPhone.safeParse(a.user.parentPhone).success) return { skipped: true, reason: 'no-parent-phone' };

  const tpl = (await loadTemplate('parent_exam_result')).WHATSAPP!;
  const vars = { name: a.user.name, score: a.score ?? 0, total: a.totalPoints, exam: a.exam.title };
  const id = await prisma.$transaction(async (tx) => {
    const { count } = await tx.examAttempt.updateMany({
      where: { id: attemptId, parentNotifiedAt: null },
      data: { parentNotifiedAt: new Date() },
    });
    if (count === 0) return null;
    const n = await tx.notification.create({
      data: {
        userId: a.user.id,
        type: 'PARENT_EXAM_RESULT',
        channel: 'WHATSAPP',
        status: 'PENDING',
        toPhone: a.user.parentPhone,
        title: renderTemplate(tpl.title, vars),
        body: renderTemplate(tpl.body, vars),
        dedupeKey: `parent-result:${attemptId}`,
      },
      select: { id: true },
    });
    return n.id;
  });
  if (id === null) return { skipped: true, reason: 'already-sent' };
  await dispatchMessages([id]);
  return { queued: id };
}

// ── تذكير الحصة اللايف (قبل الموعد بساعة) لكل مشترك ساري ──────────
export async function liveReminderJob(job: Job<{ sessionId: number; startAt: string }>) {
  const { sessionId, startAt } = job.data;
  const s = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    select: { title: true, startAt: true, courseId: true },
  });
  // job قديم: الحصة حُذفت أو تغيّر موعدها (الـ job الجديد له jobId آخر)
  if (!s || s.startAt.toISOString() !== startAt) return { skipped: true, reason: 'stale' };

  const tpl = await loadTemplate('live_reminder');
  const msg = { type: 'LIVE_REMINDER' as const, inApp: tpl.IN_APP, whatsapp: tpl.WHATSAPP, vars: { title: s.title, time: cairoTime(s.startAt) } };
  const now = new Date();
  let recipients = 0;
  for (let cursor = 0; ; ) {
    const batch = await prisma.enrollment.findMany({
      where: { courseId: s.courseId, expiresAt: { gt: now }, user: { isActive: true }, id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: FANOUT_CHUNK,
      select: { id: true, user: { select: userSelect } },
    });
    if (batch.length === 0) break;
    await fanOut(
      batch.map((e) => ({ userId: e.user.id, name: e.user.name, phone: e.user.phone, key: `live:${sessionId}:${s.startAt.getTime()}:${e.user.id}` })),
      msg,
    );
    recipients += batch.length;
    cursor = batch[batch.length - 1]!.id;
  }
  return { recipients };
}

// ── تنبيه قرب انتهاء الاشتراك (cron يومي) ─────────────────────────
// مرة واحدة لكل اشتراك لكل تاريخ انتهاء: التجديد يغيّر expiresAt ← تنبيه جديد للموعد الجديد فقط
export async function expiryWarningsJob(now = new Date()) {
  const until = new Date(now.getTime() + EXPIRY_WARN_DAYS * 24 * 60 * 60_000);
  const tpl = await loadTemplate('enrollment_expiry');
  const msg = { type: 'ENROLLMENT_EXPIRY' as const, inApp: tpl.IN_APP, whatsapp: tpl.WHATSAPP };
  let checked = 0;
  for (let cursor = 0; ; ) {
    const batch = await prisma.enrollment.findMany({
      where: { expiresAt: { gt: now, lte: until }, user: { isActive: true, role: 'STUDENT' }, id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: FANOUT_CHUNK,
      select: { id: true, expiresAt: true, course: { select: { title: true } }, user: { select: userSelect } },
    });
    if (batch.length === 0) break;
    await fanOut(
      batch.map((e) => ({
        userId: e.user.id,
        name: e.user.name,
        phone: e.user.phone,
        key: `expiry:${e.id}:${e.expiresAt.getTime()}`,
        vars: { course: e.course.title, date: cairoDate(e.expiresAt) },
      })),
      msg,
    );
    checked += batch.length;
    cursor = batch[batch.length - 1]!.id;
  }
  return { checked };
}

// ── الإرسال الجماعي: توزيع على دفعات حسب الجمهور ثم تعليم الاكتمال ──
type Audience = Pick<NotificationBroadcast, 'audience' | 'grade' | 'courseId'>;

async function broadcastBatch(b: Audience, cursor: number, now: Date) {
  if (b.audience === 'COURSE') {
    if (b.courseId === null) return []; // الكورس حُذف
    const rows = await prisma.enrollment.findMany({
      where: { courseId: b.courseId, expiresAt: { gt: now }, user: { isActive: true }, id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: FANOUT_CHUNK,
      select: { id: true, user: { select: userSelect } },
    });
    return rows.map((r) => ({ cursor: r.id, user: r.user }));
  }
  const rows = await prisma.user.findMany({
    where: { role: 'STUDENT', isActive: true, ...(b.grade && { grade: b.grade }), id: { gt: cursor } },
    orderBy: { id: 'asc' },
    take: FANOUT_CHUNK,
    select: userSelect,
  });
  return rows.map((u) => ({ cursor: u.id, user: u }));
}

export async function broadcastJob(job: Job<{ broadcastId: number }>) {
  const { broadcastId } = job.data;
  const b = await prisma.notificationBroadcast.findUnique({ where: { id: broadcastId } });
  if (!b || b.completedAt) return { skipped: true };
  const text = { title: b.title, body: b.body };
  const msg = {
    type: 'GENERAL' as const,
    broadcastId,
    inApp: text,
    whatsapp: b.alsoWhatsapp ? { title: b.title, body: `${b.title}\n\n${b.body}` } : undefined,
  };
  const now = new Date();
  for (let cursor = 0; ; ) {
    const batch = await broadcastBatch(b, cursor, now);
    if (batch.length === 0) break;
    const recipients: Recipient[] = batch.map(({ user }) => ({
      userId: user.id,
      name: user.name,
      phone: user.phone,
      key: `broadcast:${broadcastId}:${user.id}`,
    }));
    await fanOut(recipients, msg);
    cursor = batch[batch.length - 1]!.cursor;
  }
  // العدد من الصفوف الفعلية (صحيح حتى لو أُعيد تشغيل الـ job من البداية)
  const recipients = await prisma.notification.count({ where: { broadcastId, channel: 'IN_APP' } });
  await prisma.notificationBroadcast.update({ where: { id: broadcastId }, data: { recipients, completedAt: new Date() } });
  return { recipients };
}

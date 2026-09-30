import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import {
  isAllowedJoinUrl,
  LIVE_REMINDER_BEFORE_MIN,
  liveJoinWindow,
  type AdminLiveFilter,
  type AdminLiveSessionDTO,
  type LiveCreateInput,
  type LiveListDTO,
  type LiveListFilter,
  type LiveSessionDTO,
  type LiveUpdateInput,
} from '@miss-ann/shared';
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound, paginate } from '../../lib/http.js';
import { auditTx } from '../../lib/audit.js';
import { enqueue, JOBS, removeJob } from '../../lib/queue.js';

// ── الحصص اللايف ─────────────────────────────────────────────────
// joinUrl سرّ: يُرسَل للطالب المشترك فقط وداخل نافذة الانضمام (liveJoinWindow)، ولا يُكتب في
// السجلات أو AuditLog أبداً. الإدارة (أدمن + مساعد) تراه دائماً.

const sessionNotFound = () => notFound('الحصة غير موجودة');

const sessionSelect = {
  id: true,
  title: true,
  provider: true,
  courseId: true,
  joinUrl: true,
  startAt: true,
  durationMin: true,
  createdAt: true,
  updatedAt: true,
  course: { select: { title: true } },
} satisfies Prisma.LiveSessionSelect;
type SessionRow = Prisma.LiveSessionGetPayload<{ select: typeof sessionSelect }>;

export function toStudentDTO(s: SessionRow, now = new Date()): LiveSessionDTO {
  const { opensAt, endsAt } = liveJoinWindow(s.startAt, s.durationMin);
  const state = now >= endsAt ? 'ENDED' : now >= opensAt ? 'OPEN' : 'UPCOMING';
  const dto: LiveSessionDTO = {
    id: s.id,
    title: s.title,
    provider: s.provider,
    courseId: s.courseId,
    courseTitle: s.course.title,
    startAt: s.startAt.toISOString(),
    durationMin: s.durationMin,
    joinOpensAt: opensAt.toISOString(),
    endsAt: endsAt.toISOString(),
    state,
  };
  // الحقل غائب تماماً خارج النافذة (لا null ولا نص فارغ)
  if (state === 'OPEN') dto.joinUrl = s.joinUrl;
  return dto;
}

const toAdminDTO = (s: SessionRow): AdminLiveSessionDTO => ({
  id: s.id,
  title: s.title,
  provider: s.provider,
  courseId: s.courseId,
  courseTitle: s.course.title,
  joinUrl: s.joinUrl,
  startAt: s.startAt.toISOString(),
  durationMin: s.durationMin,
  createdAt: s.createdAt.toISOString(),
  updatedAt: s.updatedAt.toISOString(),
});

// ── صفحة معرّفات بشرط "انتهت/لم تنتهِ" (startAt + durationMin) في القاعدة ثم جلب الصفوف ─
// الأوقات مخزّنة UTC في timestamp بلا منطقة ← المقارنة بـ now() at time zone 'utc'
const NOW_UTC = Prisma.sql`(now() at time zone 'utc')`;
const ENDS_AT = Prisma.sql`(s."startAt" + s."durationMin" * interval '1 minute')`;

async function pageOf(where: Prisma.Sql, order: Prisma.Sql, page: number, pageSize: number) {
  const [idRows, countRows] = await prisma.$transaction([
    prisma.$queryRaw<{ id: number }[]>`
      SELECT s.id FROM "LiveSession" s WHERE ${where} ORDER BY ${order}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM "LiveSession" s WHERE ${where}`,
  ]);
  const ids = idRows.map((r) => r.id);
  const rows = ids.length ? await prisma.liveSession.findMany({ where: { id: { in: ids } }, select: sessionSelect }) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    rows: ids.map((id) => byId.get(id)).filter((r): r is SessionRow => r !== undefined),
    total: Number(countRows[0]?.count ?? 0),
  };
}

// ── GET /api/live — جلسات كورساته (اشتراك ساري) التي لم تنتهِ، الأقرب أولاً ─
export async function listForStudent(userId: number, f: LiveListFilter): Promise<LiveListDTO> {
  const where = Prisma.sql`
    s."courseId" IN (
      SELECT e."courseId" FROM "Enrollment" e WHERE e."userId" = ${userId} AND e."expiresAt" > ${NOW_UTC}
    )
    AND ${ENDS_AT} > ${NOW_UTC}`;
  const { rows, total } = await pageOf(where, Prisma.sql`s."startAt" ASC, s.id ASC`, f.page, f.pageSize);
  const now = new Date();
  return { ...paginate(rows.map((s) => toStudentDTO(s, now)), total, f.page, f.pageSize), serverNow: now.toISOString() };
}

// ── أدمن ─────────────────────────────────────────────────────────
export async function listAdmin(f: AdminLiveFilter) {
  const course = f.courseId ? Prisma.sql`AND s."courseId" = ${f.courseId}` : Prisma.empty;
  const where =
    f.scope === 'upcoming' ? Prisma.sql`${ENDS_AT} > ${NOW_UTC} ${course}` : Prisma.sql`${ENDS_AT} <= ${NOW_UTC} ${course}`;
  const order = f.scope === 'upcoming' ? Prisma.sql`s."startAt" ASC, s.id ASC` : Prisma.sql`s."startAt" DESC, s.id DESC`;
  const { rows, total } = await pageOf(where, order, f.page, f.pageSize);
  return paginate(rows.map(toAdminDTO), total, f.page, f.pageSize);
}

async function getAdmin(id: number): Promise<AdminLiveSessionDTO> {
  const s = await prisma.liveSession.findUnique({ where: { id }, select: sessionSelect });
  if (!s) throw sessionNotFound();
  return toAdminDTO(s);
}

const mustBeFuture = (startAt: Date) => {
  if (startAt.getTime() <= Date.now()) throw badRequest('موعد الحصة يجب أن يكون في المستقبل', { startAt: 'في المستقبل' });
};

export async function createSession(req: Request, input: LiveCreateInput): Promise<AdminLiveSessionDTO> {
  mustBeFuture(input.startAt);
  const course = await prisma.course.findUnique({ where: { id: input.courseId }, select: { id: true } });
  if (!course) throw badRequest('الكورس غير موجود', { courseId: 'الكورس غير موجود' });
  const s = await prisma.$transaction(async (tx) => {
    const created = await tx.liveSession.create({ data: input, select: { id: true, startAt: true } });
    await auditTx(tx, req, 'LIVE_CREATE', 'LiveSession', {
      sessionId: created.id,
      courseId: input.courseId,
      provider: input.provider,
      startAt: input.startAt.toISOString(),
    });
    return created;
  });
  void scheduleReminder(s.id, s.startAt);
  return getAdmin(s.id);
}

export async function updateSession(req: Request, id: number, input: LiveUpdateInput): Promise<AdminLiveSessionDTO> {
  const cur = await prisma.liveSession.findUnique({ where: { id }, select: { provider: true, joinUrl: true, startAt: true } });
  if (!cur) throw sessionNotFound();
  // الرابط يُفحص مقابل المزوّد بعد الدمج (تغيير أحدهما فقط لا يتجاوز القائمة المسموحة)
  if (input.joinUrl !== undefined || input.provider !== undefined) {
    const provider = input.provider ?? cur.provider;
    if (!isAllowedJoinUrl(input.joinUrl ?? cur.joinUrl, provider)) {
      throw badRequest('رابط الانضمام غير مسموح لهذا المزوّد', { joinUrl: 'رابط غير مسموح' });
    }
  }
  const moved = input.startAt !== undefined && input.startAt.getTime() !== cur.startAt.getTime();
  if (moved) mustBeFuture(input.startAt!);

  await prisma.$transaction(async (tx) => {
    await tx.liveSession.update({ where: { id }, data: input });
    await auditTx(tx, req, 'LIVE_UPDATE', 'LiveSession', {
      sessionId: id,
      fields: Object.keys(input),
      ...(moved && { from: cur.startAt.toISOString(), to: input.startAt!.toISOString() }),
    });
  });
  if (moved) void rescheduleReminder(id, cur.startAt, input.startAt!);
  return getAdmin(id);
}

export async function deleteSession(req: Request, id: number): Promise<void> {
  const startAt = await prisma.$transaction(async (tx) => {
    const s = await tx.liveSession.findUnique({ where: { id }, select: { startAt: true, title: true } });
    if (!s) throw sessionNotFound();
    await tx.liveSession.delete({ where: { id } });
    await auditTx(tx, req, 'LIVE_DELETE', 'LiveSession', { sessionId: id, title: s.title });
    return s.startAt;
  });
  cancelReminders([{ id, startAt }]);
}

// ── تذكير قبل الموعد (notifications/producers: liveReminderJob) ──
// jobId ثابت لكل (حصة، موعد): تغيير الموعد يُنشئ job جديداً ويزيل القديم، والعامل يتجاهل
// أي job لا يطابق موعده الموعد الحالي (لو فشلت الإزالة). لا شيء هنا يحجب الطلب.
export const reminderJobId = (sessionId: number, startAt: Date) => `live-reminder-${sessionId}-${startAt.getTime()}`;

export function scheduleReminder(sessionId: number, startAt: Date): Promise<boolean> {
  const delay = startAt.getTime() - LIVE_REMINDER_BEFORE_MIN * 60_000 - Date.now();
  return enqueue(
    'notifications',
    JOBS.liveReminder,
    { sessionId, startAt: startAt.toISOString() },
    { jobId: reminderJobId(sessionId, startAt), delay: Math.max(0, delay) },
  );
}

// إلغاء تذكيرات حصص حُذفت (حذف حصة، أو حذف كورس بالتتابع) — لا يحجب الطلب
export function cancelReminders(sessions: { id: number; startAt: Date }[]): void {
  for (const s of sessions) void removeJob('notifications', reminderJobId(s.id, s.startAt));
}

async function rescheduleReminder(sessionId: number, from: Date, to: Date): Promise<void> {
  await removeJob('notifications', reminderJobId(sessionId, from));
  await scheduleReminder(sessionId, to);
}

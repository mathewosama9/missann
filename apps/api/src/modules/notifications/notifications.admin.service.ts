import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import {
  CUSTOM_TEMPLATES_MAX,
  isSystemTemplate,
  SYSTEM_TEMPLATES,
  templateDefault,
  templateSpec,
  type AdminBroadcastDTO,
  type AdminMessageDTO,
  type AdminMessagesFilter,
  type BroadcastInput,
  type BroadcastListFilter,
  type NotificationTemplateDTO,
  type NotifStatus,
  type TemplateChannel,
  type TemplateContentInput,
  type TemplateCreateInput,
} from '@miss-ann/shared';
import { prisma } from '../../lib/prisma.js';
import { badRequest, conflict, notFound, paginate } from '../../lib/http.js';
import { auditTx } from '../../lib/audit.js';
import { maskPhone } from '../../lib/logger.js';
import { queueBroadcast } from './outbox.js';

// ── إدارة الإشعارات (أدمن فقط) — كل كتابة في AuditLog داخل معاملتها ──

// ── الإرسال الجماعي ──────────────────────────────────────────────
const broadcastInclude = { course: { select: { title: true } } } satisfies Prisma.NotificationBroadcastInclude;
type BroadcastRow = Prisma.NotificationBroadcastGetPayload<{ include: typeof broadcastInclude }>;

const emptyStats = (): Record<NotifStatus, number> => ({ PENDING: 0, SENT: 0, FAILED: 0 });

function toBroadcastDTO(b: BroadcastRow, messages = emptyStats()): AdminBroadcastDTO {
  return {
    id: b.id,
    title: b.title,
    body: b.body,
    audience: b.audience,
    grade: b.grade,
    courseId: b.courseId,
    courseTitle: b.course?.title ?? null,
    alsoWhatsapp: b.alsoWhatsapp,
    recipients: b.recipients,
    completedAt: b.completedAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
    messages,
  };
}

// حفظ البث + التدقيق في معاملة، ثم دفع job التوزيع (بلا انتظار الإرسال؛ الكنّاس يعيده لو فشل الدفع)
export async function createBroadcast(req: Request, input: BroadcastInput): Promise<AdminBroadcastDTO> {
  if (input.courseId && !(await prisma.course.findUnique({ where: { id: input.courseId }, select: { id: true } }))) {
    throw notFound('الكورس غير موجود');
  }
  const b = await prisma.$transaction(async (tx) => {
    const row = await tx.notificationBroadcast.create({
      data: {
        title: input.title,
        body: input.body,
        audience: input.audience,
        grade: input.grade ?? null,
        courseId: input.courseId ?? null,
        alsoWhatsapp: input.alsoWhatsapp,
      },
      include: broadcastInclude,
    });
    await auditTx(tx, req, 'NOTIF_BROADCAST', 'NotificationBroadcast', {
      broadcastId: row.id,
      audience: row.audience,
      grade: row.grade,
      courseId: row.courseId,
      alsoWhatsapp: row.alsoWhatsapp,
      title: row.title,
    });
    return row;
  });
  void queueBroadcast(b.id);
  return toBroadcastDTO(b);
}

// حالة رسائل واتساب/SMS لكل بث في الصفحة — استعلام واحد (فهرس broadcastId)
async function messageStats(ids: number[]): Promise<Map<number, Record<NotifStatus, number>>> {
  const out = new Map<number, Record<NotifStatus, number>>();
  if (ids.length === 0) return out;
  const groups = await prisma.notification.groupBy({
    by: ['broadcastId', 'status'],
    where: { broadcastId: { in: ids }, channel: { not: 'IN_APP' } },
    _count: { _all: true },
  });
  for (const g of groups) {
    const stats = out.get(g.broadcastId!) ?? emptyStats();
    stats[g.status] = g._count._all;
    out.set(g.broadcastId!, stats);
  }
  return out;
}

export async function listBroadcasts(f: BroadcastListFilter) {
  const [rows, total] = await prisma.$transaction([
    prisma.notificationBroadcast.findMany({
      include: broadcastInclude,
      orderBy: { id: 'desc' },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
    prisma.notificationBroadcast.count(),
  ]);
  const stats = await messageStats(rows.map((r) => r.id));
  return paginate(
    rows.map((r) => toBroadcastDTO(r, stats.get(r.id))),
    total,
    f.page,
    f.pageSize,
  );
}

// ── سجل الرسائل الصادرة (الفهرس الجزئي status, id WHERE channel <> IN_APP) ──
export async function listMessages(f: AdminMessagesFilter) {
  const where = { status: f.status, channel: { not: 'IN_APP' } } satisfies Prisma.NotificationWhereInput;
  const [rows, total] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      select: {
        id: true,
        type: true,
        channel: true,
        status: true,
        toPhone: true,
        body: true,
        attempts: true,
        lastError: true,
        sentAt: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
    prisma.notification.count({ where }),
  ]);
  const items: AdminMessageDTO[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    channel: r.channel,
    status: r.status,
    toPhone: maskPhone(r.toPhone ?? ''),
    userName: r.user.name,
    body: r.body,
    attempts: r.attempts,
    lastError: r.lastError,
    sentAt: r.sentAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
  return paginate(items, total, f.page, f.pageSize);
}

// ── القوالب ──────────────────────────────────────────────────────
// قائمة محدودة الحجم (مفاتيح النظام + مخصّصة بحد أقصى CUSTOM_TEMPLATES_MAX) ← تُعرض كاملة
type TemplateRow = { key: string; channel: string; title: string; body: string; updatedAt: Date };

function toTemplateDTO(key: string, channel: TemplateChannel, row: TemplateRow | undefined): NotificationTemplateDTO {
  const spec = templateSpec(key);
  const system = isSystemTemplate(key);
  const base = templateDefault(key, channel);
  return {
    key,
    channel,
    label: system ? SYSTEM_TEMPLATES[key].label : 'قالب مخصّص',
    title: row?.title || base?.title || '',
    body: row?.body ?? base?.body ?? '',
    isSystem: system,
    isCustomized: system && row !== undefined,
    vars: spec.vars,
    required: spec.required,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

export async function listTemplates(): Promise<NotificationTemplateDTO[]> {
  const rows = await prisma.notificationTemplate.findMany({ orderBy: [{ key: 'asc' }, { channel: 'asc' }] });
  const byId = new Map(rows.map((r) => [`${r.key}:${r.channel}`, r]));
  const system = Object.keys(SYSTEM_TEMPLATES).flatMap((key) =>
    templateSpec(key).channels.map((ch) => toTemplateDTO(key, ch, byId.get(`${key}:${ch}`))),
  );
  const custom = rows.filter((r) => !isSystemTemplate(r.key)).map((r) => toTemplateDTO(r.key, r.channel as TemplateChannel, r));
  return [...system, ...custom];
}

// إنشاء قالب مخصّص: قفل استشاري يسلسل الإنشاء ← فحص التكرار والحد الأقصى بلا سباق
export async function createTemplate(req: Request, input: TemplateCreateInput): Promise<NotificationTemplateDTO> {
  const row = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('notification-templates'))`;
    const exists = await tx.notificationTemplate.findUnique({ where: { key_channel: { key: input.key, channel: input.channel } }, select: { id: true } });
    if (exists) throw conflict('يوجد قالب بنفس المفتاح والقناة');
    const custom = await tx.notificationTemplate.count({ where: { key: { notIn: Object.keys(SYSTEM_TEMPLATES) } } });
    if (custom >= CUSTOM_TEMPLATES_MAX) throw badRequest(`الحد الأقصى ${CUSTOM_TEMPLATES_MAX} قالباً مخصّصاً — احذف قالباً قديماً أولاً`);
    const t = await tx.notificationTemplate.create({ data: input });
    await auditTx(tx, req, 'NOTIF_TEMPLATE_CREATE', 'NotificationTemplate', { key: t.key, channel: t.channel });
    return t;
  });
  return toTemplateDTO(row.key, row.channel as TemplateChannel, row);
}

// تعديل النص: قالب النظام ← يُنشأ/يُحدَّث التجاوز؛ المخصّص ← يجب أن يكون موجوداً
export async function saveTemplate(req: Request, key: string, channel: TemplateChannel, content: TemplateContentInput): Promise<NotificationTemplateDTO> {
  const row = await prisma.$transaction(async (tx) => {
    const where = { key_channel: { key, channel } };
    let t;
    if (isSystemTemplate(key)) {
      t = await tx.notificationTemplate.upsert({ where, create: { key, channel, ...content }, update: content });
    } else {
      const exists = await tx.notificationTemplate.findUnique({ where, select: { id: true } });
      if (!exists) throw notFound('القالب غير موجود');
      t = await tx.notificationTemplate.update({ where, data: content });
    }
    await auditTx(tx, req, 'NOTIF_TEMPLATE_UPDATE', 'NotificationTemplate', { key, channel });
    return t;
  });
  return toTemplateDTO(key, channel, row);
}

// حذف: المخصّص يُحذف، وقالب النظام يعود لنصه الافتراضي
export async function deleteTemplate(req: Request, key: string, channel: TemplateChannel): Promise<{ message: string }> {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.notificationTemplate.deleteMany({ where: { key, channel } });
    if (count === 0) throw notFound(isSystemTemplate(key) ? 'القالب يستخدم النص الافتراضي بالفعل' : 'القالب غير موجود');
    await auditTx(tx, req, 'NOTIF_TEMPLATE_DELETE', 'NotificationTemplate', { key, channel });
  });
  return { message: isSystemTemplate(key) ? 'أُعيد القالب للنص الافتراضي' : 'تم حذف القالب' };
}

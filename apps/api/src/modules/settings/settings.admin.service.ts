import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import {
  AUDIT_SECRET_KEY_RE,
  type AuditLogDTO,
  type AuditLogFilter,
  type Paginated,
  type PlatformSettingsDTO,
  type SettingsUpdateInput,
} from '@miss-ann/shared';
import { prisma } from '../../lib/prisma.js';
import { paginate } from '../../lib/http.js';
import { auditTx } from '../../lib/audit.js';

// ── إعدادات المنصة + عارض سجل العمليات (أدمن فقط) ─────────────────

async function toSettingsDTO(s: { requirePhoneVerification: boolean; updatedAt: Date; updatedById: number | null }): Promise<PlatformSettingsDTO> {
  const by = s.updatedById ? await prisma.user.findUnique({ where: { id: s.updatedById }, select: { id: true, name: true } }) : null;
  return { requirePhoneVerification: s.requirePhoneVerification, updatedAt: s.updatedAt.toISOString(), updatedBy: by };
}

export async function getSettings(): Promise<PlatformSettingsDTO> {
  const s = await prisma.platformSettings.findUnique({ where: { id: 1 } });
  // الصف يُنشأ في الـ migration؛ غيابه ← نفس الافتراضي الآمن في getPlatformSettings
  return s ? toSettingsDTO(s) : { requirePhoneVerification: true, updatedAt: new Date(0).toISOString(), updatedBy: null };
}

// التعديل + التدقيق (القيمة قبل/بعد) في معاملة واحدة؛ القفل يسلسل تعديلين متزامنين
export async function updateSettings(req: Request, input: SettingsUpdateInput): Promise<PlatformSettingsDTO> {
  const s = await prisma.$transaction(async (tx) => {
    const [before] = await tx.$queryRaw<{ requirePhoneVerification: boolean }[]>`
      SELECT "requirePhoneVerification" FROM "PlatformSettings" WHERE "id" = 1 FOR UPDATE`;
    const row = await tx.platformSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...input, updatedById: req.user!.sub },
      update: { ...input, updatedById: req.user!.sub },
    });
    await auditTx(tx, req, 'SETTINGS_UPDATE', 'PlatformSettings', {
      field: 'requirePhoneVerification',
      from: before?.requirePhoneVerification ?? true,
      to: input.requirePhoneVerification,
    });
    return row;
  });
  return toSettingsDTO(s);
}

// ── سجل العمليات ────────────────────────────────────────────────
const META_KEYS_MAX = 20;
const META_VALUE_MAX = 200;
const clip = (s: string) => (s.length > META_VALUE_MAX ? `${s.slice(0, META_VALUE_MAX)}…` : s);
// المفاتيح الحساسة تُحذف على كل المستويات (حتى داخل كائن متداخل)
const stringify = (v: unknown) => JSON.stringify(v, (k, val: unknown) => (k && AUDIT_SECRET_KEY_RE.test(k) ? undefined : val)) ?? '';

// meta ← أزواج نصية آمنة للعرض (الواجهة تعرضها كنص React، لا HTML)
export function safeMeta(meta: Prisma.JsonValue | null): AuditLogDTO['meta'] {
  if (meta === null || meta === undefined) return [];
  if (typeof meta !== 'object' || Array.isArray(meta)) return [{ key: 'value', value: clip(stringify(meta)) }];
  return Object.entries(meta)
    .filter(([k]) => !AUDIT_SECRET_KEY_RE.test(k))
    .slice(0, META_KEYS_MAX)
    .map(([k, v]) => ({ key: k.slice(0, 40), value: clip(typeof v === 'string' ? v : stringify(v)) }));
}

// الفلاتر كلها على فهارس (action,id) / (entity,id) / (actorId,id) / createdAt، والترتيب الأحدث أولاً بـ id
export async function listAuditLogs(f: AuditLogFilter): Promise<Paginated<AuditLogDTO>> {
  const createdAt = f.from || f.to ? { ...(f.from && { gte: new Date(f.from) }), ...(f.to && { lte: new Date(f.to) }) } : undefined;
  const where: Prisma.AuditLogWhereInput = {
    ...(f.action && { action: f.action }),
    ...(f.entity && { entity: f.entity }),
    // تسجيل الدخول يُكتب بلا actor وصاحبه في meta.userId (كما يعرضه actorOf) ← يدخل في فلتر المنفّذ أيضاً
    ...(f.actorId && {
      OR: [{ actorId: f.actorId }, { action: 'LOGIN', meta: { path: ['userId'], equals: f.actorId } }],
    }),
    ...(createdAt && { createdAt }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    prisma.auditLog.count({ where }),
  ]);

  // المنفّذ: actorId، أو صاحب الحساب في تسجيل الدخول (يُسجَّل بلا actor و meta.userId)
  const actorOf = (r: (typeof rows)[number]) => {
    if (r.actorId) return r.actorId;
    const m = r.meta as { userId?: unknown } | null;
    return r.action === 'LOGIN' && typeof m?.userId === 'number' ? m.userId : null;
  };
  const ids = [...new Set(rows.map(actorOf).filter((id): id is number => id !== null))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, role: true } }) : [];
  const byId = new Map(users.map((u) => [u.id, u]));

  const items: AuditLogDTO[] = rows.map((r) => {
    const actorId = actorOf(r);
    return {
      id: r.id,
      action: r.action,
      entity: r.entity,
      actor: actorId ? (byId.get(actorId) ?? null) : null,
      meta: safeMeta(r.meta),
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    };
  });
  return paginate(items, total, f.page, f.pageSize);
}

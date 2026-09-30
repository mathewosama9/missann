import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

// ── حالة الحساب لكل طلب محمي ─────────────────────────────────────
// توكن الوصول صالح 15 دقيقة، والتعطيل/إنهاء الجلسات يجب أن يسري فوراً: authGuard يسأل هنا.
// كاش في الذاكرة 30 ثانية لكل مستخدم (استعلام بالمفتاح الأساسي مرة كل 30ث بدل كل طلب)،
// والتغيير من نفس العملية يمسح الكاش فوراً؛ عمليات أخرى (لو أكثر من خادم) تتأخر 30ث بحد أقصى.
const TTL_MS = 30_000;
const MAX_ENTRIES = 10_000;

type Status = { active: boolean; revokedAtSec: number };
const cache = new Map<number, { status: Status; at: number }>();

// قراءة بدأت قبل مسح الكاش لا تُخزَّن نتيجتها (وإلا تعيد حالة "مفعّل" قديمة بعد التعطيل مباشرة)
let clock = 0;
let floor = 0;
const invalidated = new Map<number, number>();

async function readStatus(userId: number, now: number): Promise<Status> {
  const hit = cache.get(userId);
  if (hit && now - hit.at < TTL_MS) return hit.status;
  const started = ++clock;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, sessionsRevokedAt: true },
  });
  // مستخدم محذوف = غير نشط
  const status: Status = {
    active: u?.isActive ?? false,
    revokedAtSec: u?.sessionsRevokedAt ? Math.floor(u.sessionsRevokedAt.getTime() / 1000) : 0,
  };
  if (started > floor && (invalidated.get(userId) ?? 0) < started) {
    if (cache.size >= MAX_ENTRIES) cache.clear();
    cache.set(userId, { status, at: now });
  }
  return status;
}

export async function isUserActive(userId: number, now = Date.now()): Promise<boolean> {
  return (await readStatus(userId, now)).active;
}

// سبب رفض توكن وصول سليم التوقيع: حساب معطّل، أو صادر قبل آخر إنهاء للجلسات (iat بالثواني كما في JWT)
export async function sessionBlock(
  userId: number,
  issuedAtSec: number | undefined,
  now = Date.now(),
): Promise<'inactive' | 'revoked' | null> {
  const s = await readStatus(userId, now);
  if (!s.active) return 'inactive';
  return (issuedAtSec ?? 0) < s.revokedAtSec ? 'revoked' : null;
}

export function forgetUserStatus(userId: number): void {
  cache.delete(userId);
  invalidated.set(userId, ++clock);
  if (invalidated.size > MAX_ENTRIES) {
    invalidated.clear();
    floor = clock;
  }
}

// إنهاء جلسات المستخدم: كل توكنات التحديث (عدا الحالية إن مُرِّرت) + رفض توكنات الوصول الأقدم.
// داخل المعاملة؛ على المستدعي forgetUserStatus بعد الـ commit.
export async function revokeSessions(
  tx: Prisma.TransactionClient,
  userId: number,
  opts: { keepTokenHash?: string } = {},
): Promise<void> {
  const now = new Date();
  await tx.refreshToken.updateMany({
    where: { userId, revokedAt: null, ...(opts.keepTokenHash && { tokenHash: { not: opts.keepTokenHash } }) },
    data: { revokedAt: now },
  });
  await tx.user.update({ where: { id: userId }, data: { sessionsRevokedAt: now } });
}

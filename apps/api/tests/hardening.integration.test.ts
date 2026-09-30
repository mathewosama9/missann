// تقوية ما بعد Phase 8 (مراجعة Phase 9): إنهاء الجلسات يُسقط توكن الوصول فوراً، كشف إعادة استخدام توكن التحديث،
// سباق كاش حالة الحساب، حد أعلى لرقم الصفحة، فلتر المنفّذ في سجل العمليات يشمل تسجيل الدخول، وحد الأجهزة للطلاب فقط.
// بيانات مؤقتة: أرقام 0155594xxxx تُحذف بالأرقام الدقيقة (مع توكناتها وأجهزتها وسطور تدقيقها).
// Redis معزول (قاعدة 3) — هذا الملف لا يدفع jobs ولا يكتب كاشاً.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import type supertestType from 'supertest';
import { OtpPurpose } from '@miss-ann/shared';

process.env.REDIS_URL = 'redis://127.0.0.1:6379/3';

const P = '0155594';
const phone = (n: number) => `${P}${String(n).padStart(4, '0')}`;
const PASSWORD = 'Hard@12345';
const NEW_PASSWORD = 'Hard@67890';
const ALL_PHONES = Array.from({ length: 12 }, (_, i) => phone(i + 1));

let app: Express;
let prisma: PrismaClient;
let request: typeof supertestType;
let tokens: typeof import('../src/lib/tokens.js');
let status: typeof import('../src/lib/userStatus.js');

type Role = 'STUDENT' | 'ADMIN' | 'ASSISTANT';
type U = { id: number; role: Role; name: string };
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
// توكن وصول صادر قبل دقيقة (iat أقدم من أي إنهاء للجلسات يحدث في الاختبار)
const oldToken = (u: U) => tokens.signAccessToken({ sub: u.id, role: u.role, name: u.name, iat: Math.floor(Date.now() / 1000) - 60 } as never);
const freshToken = (u: U) => tokens.signAccessToken({ sub: u.id, role: u.role, name: u.name, iat: Math.floor(Date.now() / 1000) + 1 } as never);

async function mkUser(n: number, role: Role): Promise<U> {
  const { hashPassword } = await import('../src/lib/password.js');
  const name = `اختبار تقوية ${n}`;
  const row = await prisma.user.create({
    data: {
      name,
      phone: phone(n),
      parentPhone: phone(n + 50),
      passwordHash: await hashPassword(PASSWORD),
      isActive: true,
      role,
      ...(role === 'STUDENT' && { grade: 'FOURTH_PRIMARY', wallet: { create: { balance: 0 } } }),
    },
  });
  return { id: row.id, role, name };
}

// توكن تحديث حقيقي في القاعدة (بدل تسجيل دخول يستهلك حد المحاولات)
async function mkRefresh(u: U): Promise<string> {
  const { token, hash } = tokens.generateRefreshToken();
  await prisma.refreshToken.create({ data: { userId: u.id, tokenHash: hash, expiresAt: tokens.refreshExpiry(true), remember: true } });
  return token;
}
const refreshWith = (raw: string) => request(app).post('/api/auth/refresh').set('Cookie', `ma_rt=${raw}`);
const rtCookie = (res: { headers: Record<string, unknown> }) =>
  ([] as string[]).concat((res.headers['set-cookie'] as string[] | undefined) ?? []).find((c) => c.startsWith('ma_rt='));

async function cleanup() {
  const users = await prisma.user.findMany({ where: { phone: { in: ALL_PHONES } }, select: { id: true } });
  const ids = users.map((x) => x.id);
  await prisma.otp.deleteMany({ where: { phone: { in: ALL_PHONES } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  // سطور بلا actor تخص مستخدمينا: تسجيل الدخول وإعادة استخدام التوكن (meta.userId)
  const orphans = await prisma.auditLog.findMany({
    where: { actorId: null, action: { in: ['LOGIN', 'REFRESH_TOKEN_REUSE'] } },
    select: { id: true, meta: true },
  });
  const ours = orphans.filter((l) => ids.includes((l.meta as { userId?: number } | null)?.userId ?? -1)).map((l) => l.id);
  await prisma.auditLog.deleteMany({ where: { id: { in: ours } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

let admin: U;

beforeAll(async () => {
  await import('dotenv/config');
  process.env.REDIS_URL = 'redis://127.0.0.1:6379/3';
  ({ prisma } = await import('../src/lib/prisma.js'));
  const { createApp } = await import('../src/app.js');
  tokens = await import('../src/lib/tokens.js');
  status = await import('../src/lib/userStatus.js');
  request = (await import('supertest')).default;
  app = createApp();
  await cleanup();
  admin = await mkUser(1, 'ADMIN');
});

afterAll(async () => {
  await cleanup();
  const { redis } = await import('../src/lib/redis.js');
  await redis.quit().catch(() => undefined);
  await prisma.$disconnect();
});

describe('إنهاء الجلسات يُسقط توكن الوصول الحالي فوراً', () => {
  it('الأدمن يعيد تعيين كلمة مرور طالب ← توكنه القديم 401 فوراً، والتوكن الجديد يعمل', async () => {
    const s = await mkUser(2, 'STUDENT');
    const t = oldToken(s);
    expect((await request(app).get('/api/me/overview').set(auth(t))).status).toBe(200);
    expect((await request(app).post(`/api/admin/students/${s.id}/reset-password`).set(auth(freshToken(admin)))).status).toBe(200);
    const after = await request(app).get('/api/me/overview').set(auth(t));
    expect(after.status).toBe(401);
    expect(after.body.message).toBe('انتهت الجلسة، سجّل الدخول من جديد');
    expect((await request(app).get('/api/me/overview').set(auth(freshToken(s)))).status).toBe(200);
  });

  it('الأدمن يزيل جهاز طالب ← توكن الوصول القديم 401 وتوكن التحديث مُبطل', async () => {
    const s = await mkUser(3, 'STUDENT');
    const t = oldToken(s);
    const rt = await mkRefresh(s);
    const dev = await prisma.device.create({ data: { userId: s.id, deviceFingerprint: 'gate-hard-3', userAgent: 'test', ip: '' } });
    expect((await request(app).get('/api/me/overview').set(auth(t))).status).toBe(200);
    expect((await request(app).delete(`/api/admin/students/${s.id}/devices/${dev.id}`).set(auth(freshToken(admin)))).status).toBe(200);
    expect((await request(app).get('/api/me/overview').set(auth(t))).status).toBe(401);
    expect((await refreshWith(rt)).status).toBe(401);
  });

  it('الطالب يزيل جهازاً ← الجلسات الأخرى تُبطل والحالية تبقى وتجدّد', async () => {
    const s = await mkUser(4, 'STUDENT');
    const t = oldToken(s);
    const current = await mkRefresh(s);
    const other = await mkRefresh(s);
    const dev = await prisma.device.create({ data: { userId: s.id, deviceFingerprint: 'gate-hard-4', userAgent: 'test', ip: '' } });
    const r = await request(app).delete(`/api/auth/devices/${dev.id}`).set(auth(t)).set('Cookie', `ma_rt=${current}`);
    expect(r.status).toBe(200);
    expect(await prisma.device.count({ where: { id: dev.id } })).toBe(0);
    expect((await request(app).get('/api/auth/me').set(auth(t))).status).toBe(401);
    expect((await refreshWith(other)).status).toBe(401);
    const renewed = await refreshWith(current);
    expect(renewed.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth(renewed.body.accessToken))).status).toBe(200);
  });

  it('جهاز طالب آخر ← 404 بلا إبطال لأي جلسة (لا IDOR)', async () => {
    const a = await mkUser(5, 'STUDENT');
    const b = await mkUser(6, 'STUDENT');
    const bRt = await mkRefresh(b);
    const bDev = await prisma.device.create({ data: { userId: b.id, deviceFingerprint: 'gate-hard-6', userAgent: 'test', ip: '' } });
    expect((await request(app).delete(`/api/auth/devices/${bDev.id}`).set(auth(freshToken(a)))).status).toBe(404);
    expect(await prisma.device.count({ where: { id: bDev.id } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).sessionsRevokedAt).toBeNull();
    expect((await refreshWith(bRt)).status).toBe(200);
  });

  it('تغيير كلمة المرور من الحساب ← الأجهزة الأخرى تخرج والحالية تبقى', async () => {
    const s = await mkUser(7, 'STUDENT');
    const t = oldToken(s);
    const current = await mkRefresh(s);
    const other = await mkRefresh(s);
    const r = await request(app)
      .post('/api/auth/change-password')
      .set(auth(t))
      .set('Cookie', `ma_rt=${current}`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(r.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth(t))).status).toBe(401);
    expect((await refreshWith(other)).status).toBe(401);
    expect((await refreshWith(current)).status).toBe(200);
  });

  it('استعادة كلمة المرور بالكود ← توكن الوصول القديم 401', async () => {
    const s = await mkUser(8, 'STUDENT');
    const t = oldToken(s);
    const { issueOtp } = await import('../src/lib/otp.js');
    const code = await issueOtp(phone(8), OtpPurpose.RESET);
    expect(code).toBeTruthy();
    const r = await request(app).post('/api/auth/reset-password').send({ phone: phone(8), code, newPassword: NEW_PASSWORD });
    expect(r.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth(t))).status).toBe(401);
  });
});

describe('كشف إعادة استخدام توكن التحديث', () => {
  it('توكن مُدوَّر يعود بعد المهلة ← كل الجلسات تُنهى، الكوكي يُمسح، وسطر تدقيق', async () => {
    const s = await mkUser(9, 'STUDENT');
    const stolen = await mkRefresh(s);
    const rotated = await refreshWith(stolen);
    expect(rotated.status).toBe(200);
    const next = rtCookie(rotated)!.split(';')[0]!.slice('ma_rt='.length);
    // iat بدقة الثانية: توكن صادر في نفس ثانية الإنهاء يبقى مقبولاً (عمداً، كي لا يُرفض تجديد الجهاز الحالي)
    await new Promise((r) => setTimeout(r, 1_100));
    // السارق يعود بالنسخة القديمة بعد دقيقة
    await prisma.refreshToken.updateMany({
      where: { tokenHash: tokens.hashToken(stolen) },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });
    const reuse = await refreshWith(stolen);
    expect(reuse.status).toBe(401);
    expect(rtCookie(reuse)).toMatch(/^ma_rt=;/);
    // السلسلة الجديدة (التي قد تكون مع السارق) لم تعد صالحة
    expect((await refreshWith(next)).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(auth(rotated.body.accessToken))).status).toBe(401);
    const rows = await prisma.auditLog.findMany({ where: { action: 'REFRESH_TOKEN_REUSE' } });
    expect(rows.filter((r) => (r.meta as { userId?: number }).userId === s.id)).toHaveLength(1);
  });

  it('سباق تبويبين خلال المهلة ← 401 للمتأخر فقط، والجلسة الجديدة تبقى', async () => {
    const s = await mkUser(10, 'STUDENT');
    const raw = await mkRefresh(s);
    const first = await refreshWith(raw);
    expect(first.status).toBe(200);
    expect((await refreshWith(raw)).status).toBe(401);
    const next = rtCookie(first)!.split(';')[0]!.slice('ma_rt='.length);
    expect((await refreshWith(next)).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'REFRESH_TOKEN_REUSE', meta: { path: ['userId'], equals: s.id } } })).toBe(0);
  });
});

describe('كاش حالة الحساب', () => {
  it('قراءة بدأت قبل التعطيل لا تعيد "مفعّل" للكاش بعده', async () => {
    const s = await mkUser(11, 'STUDENT');
    status.forgetUserStatus(s.id);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let readDone!: () => void;
    const read = new Promise<void>((r) => (readDone = r));
    // القراءة الأولى تقرأ الحساب مفعّلاً من القاعدة، ثم تتأخر حتى بعد التعطيل ومسح الكاش
    let hold = true;
    prisma.$use(async (params, next) => {
      if (!hold || params.model !== 'User' || params.action !== 'findUnique') return next(params);
      hold = false;
      const result = await next(params);
      readDone();
      await gate;
      return result;
    });
    const slow = status.isUserActive(s.id);
    await read;
    await prisma.user.update({ where: { id: s.id }, data: { isActive: false } });
    status.forgetUserStatus(s.id);
    release();
    expect(await slow).toBe(true);
    // بدون الحماية كانت "مفعّل" القديمة تُخزَّن 30 ثانية
    expect(await status.isUserActive(s.id)).toBe(false);
  });
});

describe('حدود المدخلات وفلتر سجل العمليات', () => {
  it('رقم صفحة ضخم ← 400 لا 500 (الكتالوج العام وقوائم الأدمن)', async () => {
    expect((await request(app).get('/api/courses?page=1e20')).status).toBe(400);
    expect((await request(app).get('/api/courses?page=10001')).status).toBe(400);
    expect((await request(app).get('/api/courses?page=10000')).status).toBe(200);
    expect((await request(app).get('/api/admin/audit-logs?page=99999999999').set(auth(freshToken(admin)))).status).toBe(400);
  });

  it('فلتر المنفّذ يشمل سطور تسجيل الدخول (بلا actor، صاحبها في meta.userId)', async () => {
    const s = await mkUser(12, 'STUDENT');
    const row = await prisma.auditLog.create({ data: { actorId: null, action: 'LOGIN', entity: 'User', meta: { userId: s.id }, ip: '' } });
    const r = await request(app).get(`/api/admin/audit-logs?actorId=${s.id}`).set(auth(freshToken(admin)));
    expect(r.status).toBe(200);
    expect(r.body.items.map((i: { id: number }) => i.id)).toContain(row.id);
    expect(r.body.items.every((i: { actor: { id: number } | null }) => i.actor?.id === s.id)).toBe(true);
  });
});

describe('حد الأجهزة', () => {
  it('الأدمن يدخل من 3 أجهزة (الحد للطلاب فقط) وكلها تُسجَّل', async () => {
    for (const fp of ['gate-hard-a1', 'gate-hard-a2', 'gate-hard-a3']) {
      const r = await request(app)
        .post('/api/auth/login')
        .send({ identifier: phone(1), password: PASSWORD, deviceFingerprint: fp, rememberMe: false });
      expect(r.status).toBe(200);
    }
    expect(await prisma.device.count({ where: { userId: admin.id } })).toBe(3);
  });
});

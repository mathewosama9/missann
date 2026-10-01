// أمان Phase 9: مسح RBAC لكل مسار في الـ API (من جدول المسارات نفسه)، حماية CSRF لمسارات الكوكي،
// ترويسات التخزين، كاش الكتالوج وإبطاله، إخفاء الأسرار من السجلات، وفحص إعدادات الإنتاج.
// بيانات مؤقتة: أرقام 015559402xx وكورسات TEST-P9، تُحذف بالأرقام/العناوين الدقيقة.
// Redis معزول (قاعدة 3) — مفاتيح catalog:* التي يكتبها الملف تُحذف في النهاية.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Writable } from 'node:stream';
import type { Express, Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type supertestType from 'supertest';
import { routeTable, type RouteEntry } from './routeTable.js';

process.env.REDIS_URL = 'redis://127.0.0.1:6379/3';
// المسح يرسل مئات الطلبات من IP واحد خلال ثوانٍ
process.env.RATE_LIMIT_PER_MIN = '5000';

const P = '015559402';
const phone = (n: number) => `${P}${String(n).padStart(2, '0')}`;
const ALL_PHONES = [1, 2, 3, 4].map(phone);
const T = 'TEST-P9';

let app: Express;
let prisma: PrismaClient;
let request: typeof supertestType;
let routes: RouteEntry[];
let adminOnlyOwners: Set<Router>;
const tok: Record<'admin' | 'assistant' | 'student', string> = {} as never;
let adminId = 0;
// نسخة الوحدة التي يستخدمها التطبيق (اختبارات env تعيد تحميل الوحدات بـ resetModules)
let forgetUserStatus: (id: number) => void;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

// مسارات بلا تسجيل دخول عمداً (الباقي كله يجب أن يرفض بلا توكن)
const PUBLIC = new Set([
  'GET /api/health/',
  'POST /api/auth/register',
  'POST /api/auth/verify-otp',
  'POST /api/auth/login',
  'POST /api/auth/refresh',
  'POST /api/auth/logout',
  'POST /api/auth/forgot-password',
  'POST /api/auth/reset-password',
  'GET /api/courses/',
  'GET /api/courses/2147483600',
  'GET /api/courses/2147483600/lessons/2147483600',
  'POST /api/payments/paymob/webhook',
]);
// مسارات أدمن فقط داخل routers مشتركة مع المساعد
const ADMIN_ONLY_EXTRA = new Set(['DELETE /api/admin/courses/2147483600']);
const key = (r: RouteEntry) => `${r.method} ${r.path}`;
const call = (r: RouteEntry) => {
  const m = r.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
  return request(app)[m](r.path);
};

async function cleanup() {
  const users = await prisma.user.findMany({ where: { phone: { in: ALL_PHONES } }, select: { id: true } });
  const ids = users.map((x) => x.id);
  await prisma.course.deleteMany({ where: { title: { startsWith: T } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(async () => {
  await import('dotenv/config');
  process.env.REDIS_URL = 'redis://127.0.0.1:6379/3';
  ({ prisma } = await import('../src/lib/prisma.js'));
  const { createApp } = await import('../src/app.js');
  const { apiRouter } = await import('../src/routes.js');
  const { signAccessToken } = await import('../src/lib/tokens.js');
  const { hashPassword } = await import('../src/lib/password.js');
  request = (await import('supertest')).default;
  app = createApp();
  routes = routeTable(apiRouter);
  ({ forgetUserStatus } = await import('../src/lib/userStatus.js'));

  // routers حراستها ADMIN وحده (من routes.ts): المساعد يجب أن يُرفض في كل مساراتها
  adminOnlyOwners = new Set<Router>([
    (await import('../src/modules/codes/codes.admin.routes.js')).codesAdminRouter,
    (await import('../src/modules/notifications/notifications.admin.routes.js')).adminNotificationsRouter,
    (await import('../src/modules/stats/stats.admin.routes.js')).adminStatsRouter,
    (await import('../src/modules/users/users.admin.routes.js')).adminStudentsRouter,
    (await import('../src/modules/users/users.admin.routes.js')).adminStaffRouter,
    (await import('../src/modules/settings/settings.admin.routes.js')).adminSettingsRouter,
    (await import('../src/modules/settings/settings.admin.routes.js')).adminAuditRouter,
    (await import('../src/modules/payments/finance.admin.routes.js')).financeAdminRouter,
  ]);

  await cleanup();
  const passwordHash = await hashPassword('Sec@123456');
  for (const [i, role] of (['ADMIN', 'ASSISTANT', 'STUDENT'] as const).entries()) {
    const u = await prisma.user.create({
      data: { name: `${T} ${role}`, phone: phone(i + 1), parentPhone: phone(i + 1), passwordHash, role, isActive: true, ...(role === 'STUDENT' && { grade: 'FIFTH_PRIMARY' as const }) },
    });
    const k = role === 'ADMIN' ? 'admin' : role === 'ASSISTANT' ? 'assistant' : 'student';
    tok[k] = signAccessToken({ sub: u.id, role, name: u.name });
    if (role === 'ADMIN') adminId = u.id;
  }
});

afterAll(async () => {
  await cleanup();
  const { redis } = await import('../src/lib/redis.js');
  const keys = await redis.keys('catalog:*');
  if (keys.length) await redis.del(...keys);
  await redis.quit().catch(() => undefined);
  await prisma.$disconnect();
});

describe('مسح RBAC لكل مسارات الـ API', () => {
  it('جدول المسارات مكتمل (يشمل مسارات كل المراحل)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(100);
    for (const k of ['GET /api/admin/stats/', 'POST /api/wallet/redeem', 'DELETE /api/admin/courses/2147483600', 'GET /api/me/overview']) {
      expect(routes.map(key)).toContain(k);
    }
  });

  it('كل مسار غير عام يرفض الطلب بلا توكن (401)', async () => {
    const bad: string[] = [];
    for (const r of routes.filter((x) => !PUBLIC.has(key(x)))) {
      const res = await call(r);
      if (res.status !== 401) bad.push(`${key(r)} → ${res.status}`);
    }
    expect(bad).toEqual([]);
  });

  it('كل مسارات /admin ترفض الطالب (403)', async () => {
    const bad: string[] = [];
    for (const r of routes.filter((x) => x.path.startsWith('/api/admin/'))) {
      const res = await call(r).set(auth(tok.student));
      if (res.status !== 403) bad.push(`${key(r)} → ${res.status}`);
    }
    expect(bad).toEqual([]);
  });

  it('مسارات الأدمن وحده ترفض المساعد (403)', async () => {
    const adminOnly = routes.filter((r) => adminOnlyOwners.has(r.owner) || ADMIN_ONLY_EXTRA.has(key(r)));
    expect(adminOnly.length).toBeGreaterThanOrEqual(29);
    const bad: string[] = [];
    for (const r of adminOnly) {
      const res = await call(r).set(auth(tok.assistant));
      if (res.status !== 403) bad.push(`${key(r)} → ${res.status}`);
    }
    expect(bad).toEqual([]);
  });

  it('مسارات المساعد (قراءة) تسمح له — لا تقييد زائد', async () => {
    const staffReads = routes.filter(
      (r) => r.method === 'GET' && r.path.startsWith('/api/admin/') && !adminOnlyOwners.has(r.owner) && !ADMIN_ONLY_EXTRA.has(key(r)),
    );
    expect(staffReads.length).toBeGreaterThanOrEqual(10);
    const bad: string[] = [];
    for (const r of staffReads) {
      const res = await call(r).set(auth(tok.assistant));
      if (res.status === 401 || res.status === 403 || res.status >= 500) bad.push(`${key(r)} → ${res.status}`);
    }
    expect(bad).toEqual([]);
  });

  it('مسارات الطالب ترفض الأدمن والمساعد (لوحة الطالب، الامتحانات، اللايف)', async () => {
    const studentOnly = routes.filter((r) => /^\/api\/(me|exams|attempts|live)\//.test(r.path) || key(r) === 'POST /api/courses/2147483600/subscribe');
    const bad: string[] = [];
    for (const r of studentOnly) {
      for (const t of [tok.admin, tok.assistant]) {
        const res = await call(r).set(auth(t));
        if (res.status !== 403) bad.push(`${key(r)} → ${res.status}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('CSRF: مسارات كوكي التحديث', () => {
  it('طلب من موقع آخر ← 403 (Origin مختلف أو Sec-Fetch-Site: cross-site)', async () => {
    for (const path of ['/api/auth/refresh', '/api/auth/logout']) {
      expect((await request(app).post(path).set('Origin', 'https://evil.example')).status, path).toBe(403);
      expect((await request(app).post(path).set('Sec-Fetch-Site', 'cross-site')).status, path).toBe(403);
    }
  });

  it('نفس الموقع أو بلا مصدر (أداة) ← يمر للمعالج (401 بلا كوكي للتجديد، 200 للخروج)', async () => {
    const origin = new URL(process.env.APP_URL ?? 'http://localhost:5173').origin;
    expect((await request(app).post('/api/auth/refresh').set('Origin', origin).set('Sec-Fetch-Site', 'same-origin')).status).toBe(401);
    expect((await request(app).post('/api/auth/logout').set('Origin', origin)).status).toBe(200);
    expect((await request(app).post('/api/auth/refresh')).status).toBe(401);
  });
});

describe('ترويسات التخزين (HTTP cache)', () => {
  it('ردود الـ API خاصة افتراضياً؛ الكتالوج العام يُخزَّن قصيراً؛ تفاصيل كورس لمسجّل تبقى خاصة', async () => {
    expect((await request(app).get('/api/auth/me').set(auth(tok.student))).headers['cache-control']).toBe('no-store');
    expect((await request(app).get('/api/wallet').set(auth(tok.student))).headers['cache-control']).toBe('no-store');
    const list = await request(app).get('/api/courses');
    expect(list.status).toBe(200);
    expect(list.headers['cache-control']).toBe('public, max-age=30, stale-while-revalidate=300');
    const course = await prisma.course.findFirst({ where: { isPublished: true }, select: { id: true } });
    if (course) {
      const anon = await request(app).get(`/api/courses/${course.id}`);
      expect(anon.headers['cache-control']).toMatch(/^public/);
      expect(anon.headers.vary).toMatch(/Authorization/);
      const authed = await request(app).get(`/api/courses/${course.id}`).set(auth(tok.student));
      expect(authed.headers['cache-control']).toBe('no-store');
    }
    // الأخطاء أيضاً لا تُخزَّن
    expect((await request(app).get('/api/courses/2147483600')).headers['cache-control']).toBe('no-store');
  });

  it('مضغوطة (gzip) للردود الكبيرة', async () => {
    const r = await request(app).get('/api/courses?pageSize=100').set('Accept-Encoding', 'gzip');
    if (Number(r.headers['content-length'] ?? 2000) >= 1024 || r.headers['content-encoding']) {
      expect(r.headers['content-encoding']).toBe('gzip');
    }
  });
});

describe('كاش الكتالوج العام (Redis) وإبطاله', () => {
  it('النشر والتعديل من لوحة الأدمن يظهران فوراً رغم الكاش', async () => {
    const list = () => request(app).get('/api/courses?grade=SIXTH_PRIMARY&pageSize=100');
    const titles = async () => ((await list()).body.items as { title: string }[]).map((c) => c.title);
    await list(); // يملأ الكاش
    const { redis } = await import('../src/lib/redis.js');
    expect((await redis.keys('catalog:*:list:*')).length).toBeGreaterThan(0);

    const created = await request(app)
      .post('/api/admin/courses')
      .set(auth(tok.admin))
      .send({ title: `${T} كاش`, description: 'اختبار كاش الكتالوج', grade: 'SIXTH_PRIMARY', type: 'REVISION', price: 0 });
    expect(created.status).toBe(201);
    const id = created.body.course.id as number;
    expect(await titles()).not.toContain(`${T} كاش`); // غير منشور بعد
    expect((await request(app).patch(`/api/admin/courses/${id}/publish`).set(auth(tok.admin)).send({ isPublished: true })).status).toBe(200);
    expect(await titles()).toContain(`${T} كاش`);

    // التفاصيل من الكاش ثم تعديل العنوان ← يظهر فوراً
    expect((await request(app).get(`/api/courses/${id}`)).body.course.title).toBe(`${T} كاش`);
    expect((await request(app).patch(`/api/admin/courses/${id}`).set(auth(tok.admin)).send({ title: `${T} كاش معدّل` })).status).toBe(200);
    expect((await request(app).get(`/api/courses/${id}`)).body.course.title).toBe(`${T} كاش معدّل`);
    // حصة جديدة ← عدد الحصص يتحدث
    expect((await request(app).post(`/api/admin/courses/${id}/lessons`).set(auth(tok.admin)).send({ title: `${T} حصة`, isFreePreview: true })).status).toBe(201);
    expect((await request(app).get(`/api/courses/${id}`)).body.course.lessonsCount).toBe(1);

    // الإخفاء ← يختفي من الكتالوج والتفاصيل 404
    expect((await request(app).patch(`/api/admin/courses/${id}/publish`).set(auth(tok.admin)).send({ isPublished: false })).status).toBe(200);
    expect(await titles()).not.toContain(`${T} كاش معدّل`);
    expect((await request(app).get(`/api/courses/${id}`)).status).toBe(404);
    expect(adminId).toBeGreaterThan(0);
  });

  it('حالة الاشتراك لا تُخزَّن مع الكورس (لكل مستخدم على حدة)', async () => {
    const course = await prisma.course.findFirst({ where: { isPublished: true, price: { gt: 0 } }, select: { id: true } });
    if (!course) return;
    await request(app).get(`/api/courses/${course.id}`); // يملأ الكاش كزائر
    const r = await request(app).get(`/api/courses/${course.id}`).set(auth(tok.student));
    expect(r.body.course.enrolled).toBe(false);
    expect(r.body.course.lessons.filter((l: { isFreePreview: boolean; locked: boolean }) => !l.isFreePreview).every((l: { locked: boolean }) => l.locked)).toBe(true);
  });
});

describe('الأسرار خارج السجلات', () => {
  it('توكن الوصول، الكوكيز، وكوكي التحديث في ترويسة الرد تُحجب', async () => {
    const pino = (await import('pino')).default;
    const { LOG_REDACT_PATHS } = await import('../src/lib/logger.js');
    let out = '';
    const sink = new Writable({ write: (chunk, _enc, cb) => ((out += String(chunk)), cb()) });
    const log = pino({ redact: { paths: LOG_REDACT_PATHS, censor: '[محجوب]' } }, sink);
    log.info({
      req: { headers: { authorization: 'Bearer SECRET_ACCESS', cookie: 'ma_rt=SECRET_COOKIE' } },
      res: { headers: { 'set-cookie': 'ma_rt=SECRET_ROTATED; HttpOnly' } },
      body: { password: 'SECRET_PASS', token: 'SECRET_TOKEN' },
    });
    expect(out).not.toMatch(/SECRET_/);
    expect(out).toContain('[محجوب]');
  });
});

describe('إعدادات الإنتاج', () => {
  const run = async (overrides: Record<string, string>) => {
    const saved = { ...process.env };
    Object.assign(process.env, overrides);
    vi.resetModules();
    try {
      await import('../src/lib/env.js');
      return 'ok';
    } catch {
      return 'rejected';
    } finally {
      process.env = saved;
      vi.resetModules();
    }
  };
  const strong = { JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40), APP_URL: 'https://missann.example' };

  it('أسرار ضعيفة/مثال/متطابقة أو APP_URL بلا https ← الإقلاع يُرفض', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await run({ NODE_ENV: 'production', ...strong, JWT_ACCESS_SECRET: 'change_me_access_secret_min_16_chars_xxxxx' })).toBe('rejected');
    expect(await run({ NODE_ENV: 'production', ...strong, JWT_REFRESH_SECRET: 'short-but-16-chars' })).toBe('rejected');
    expect(await run({ NODE_ENV: 'production', ...strong, JWT_REFRESH_SECRET: strong.JWT_ACCESS_SECRET })).toBe('rejected');
    expect(await run({ NODE_ENV: 'production', ...strong, APP_URL: 'http://missann.example' })).toBe('rejected');
    expect(await run({ NODE_ENV: 'production', ...strong })).toBe('ok');
    spy.mockRestore();
  });
});

describe('سقف تغيير كلمة المرور', () => {
  it('تخمين كلمة المرور الحالية بتوكن ← 429 بعد 8 محاولات', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 9; i++) {
      const r = await request(app).post('/api/auth/change-password').set(auth(tok.student)).send({ currentPassword: `Wrong@${i}xxxx`, newPassword: 'Newer@123456' });
      codes.push(r.status);
    }
    expect(codes.slice(0, 8).every((c) => c === 400)).toBe(true);
    expect(codes[8]).toBe(429);
  });
});

// قرار المالكة: إخفاء الكورس يوقف الاشتراكات الجديدة فقط — المشترك الساري يكمل حصصه
describe('كورس مخفي + optionalAuth', () => {
  let hiddenId = 0;
  let paidLesson = 0;
  let freeLesson = 0;
  let enrolled = '';
  let enrolledId = 0;

  beforeAll(async () => {
    const { signAccessToken } = await import('../src/lib/tokens.js');
    const c = await prisma.course.create({
      data: {
        title: `${T} مخفي`,
        description: 'اختبار',
        grade: 'FIFTH_PRIMARY',
        type: 'MONTHLY',
        price: 1000,
        isPublished: false,
        lessons: { create: [{ title: `${T} مجانية`, order: 0, isFreePreview: true }, { title: `${T} مدفوعة`, order: 1 }] },
      },
      include: { lessons: { orderBy: { order: 'asc' } } },
    });
    hiddenId = c.id;
    freeLesson = c.lessons[0]!.id;
    paidLesson = c.lessons[1]!.id;
    const { hashPassword } = await import('../src/lib/password.js');
    const u = await prisma.user.create({
      data: { name: `${T} مشترك`, phone: phone(4), parentPhone: phone(4), passwordHash: await hashPassword('Sec@123456'), role: 'STUDENT', isActive: true, grade: 'FIFTH_PRIMARY' },
    });
    enrolledId = u.id;
    await prisma.enrollment.create({ data: { userId: u.id, courseId: c.id, source: 'ADMIN', expiresAt: new Date(Date.now() + 86_400_000) } });
    enrolled = signAccessToken({ sub: u.id, role: 'STUDENT', name: u.name, iat: Math.floor(Date.now() / 1000) - 60 } as never);
  });

  it('المشترك الساري يكمل: التفاصيل، مرجع الحصة المدفوعة، والتشغيل يتخطى بوابة الوصول', async () => {
    const d = await request(app).get(`/api/courses/${hiddenId}`).set(auth(enrolled));
    expect(d.status).toBe(200);
    expect(d.body.course.enrolled).toBe(true);
    expect(d.body.course.lessons.every((l: { locked: boolean }) => !l.locked)).toBe(true);
    expect((await request(app).get(`/api/courses/${hiddenId}/lessons/${paidLesson}`).set(auth(enrolled))).status).toBe(200);
    // لا فيديو مرفوع ← 404 برسالة "لم يُرفع فيديو" (أي أن الوصول نفسه مسموح)
    const play = await request(app).get(`/api/lessons/${paidLesson}/play`).set(auth(enrolled));
    expect(play.status).toBe(404);
    expect(play.body.message).toBe('لم يُرفع فيديو لهذه الحصة بعد');
  });

  it('غير المشترك والزائر: الكورس المخفي غير موجود (حتى معاينته المجانية)', async () => {
    expect((await request(app).get(`/api/courses/${hiddenId}`)).status).toBe(404);
    expect((await request(app).get(`/api/courses/${hiddenId}`).set(auth(tok.student))).status).toBe(404);
    expect((await request(app).get(`/api/courses/${hiddenId}/lessons/${freeLesson}`)).status).toBe(404);
    expect((await request(app).get(`/api/courses/${hiddenId}/lessons/${freeLesson}`).set(auth(tok.student))).status).toBe(404);
    const play = await request(app).get(`/api/lessons/${freeLesson}/play`).set(auth(tok.student));
    expect(play.status).toBe(404);
    expect(play.body.message).toBe('الحصة غير موجودة');
    // ولا يظهر في الكتالوج ولا يقبل اشتراكاً جديداً
    expect(((await request(app).get('/api/courses?grade=FIFTH_PRIMARY&pageSize=100')).body.items as { id: number }[]).map((c) => c.id)).not.toContain(hiddenId);
    expect((await request(app).post(`/api/courses/${hiddenId}/subscribe`).set(auth(tok.student))).status).toBe(404);
  });

  it('optionalAuth: توكن جلسة منتهية ← زائر (لا حالة اشتراك ولا وصول للمدفوع)', async () => {
    await prisma.user.update({ where: { id: enrolledId }, data: { sessionsRevokedAt: new Date() } });
    forgetUserStatus(enrolledId);
    expect((await request(app).get(`/api/courses/${hiddenId}`).set(auth(enrolled))).status).toBe(404);
    expect((await request(app).get(`/api/courses/${hiddenId}/lessons/${paidLesson}`).set(auth(enrolled))).status).toBe(404);
  });
});

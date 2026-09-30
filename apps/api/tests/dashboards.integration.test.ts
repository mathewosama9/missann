// لوحات التحكم (Phase 8): إحصائيات الأدمن، إدارة الطلاب والمساعدين، إعدادات المنصة، سجل العمليات، ولوحة الطالب.
// لكل endpoint: RBAC، IDOR، تحقق (كل 400 من القاعدة المختبرة وحدها)، ترقيم، وتدقيق داخل المعاملة.
// بيانات مؤقتة: أرقام 0155595xxxx (0155599 يحذفه اختبار المحفظة بالبادئة) وعناوين TEST-P8، تُحذف بالمعرّفات/العناوين الدقيقة؛ إعداد التحقق يُعاد لقيمته الأصلية.
// Redis معزول (قاعدة 3) للكاش و jobs كود التحقق — لا يلمسها عمّال خادم التطوير.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import type supertestType from 'supertest';

process.env.REDIS_URL = 'redis://127.0.0.1:6379/3';

const P = '0155595';
const T = 'TEST-P8';
const phone = (n: number) => `${P}${String(n).padStart(4, '0')}`;
const PHONES = Array.from({ length: 12 }, (_, i) => phone(i + 1));
const REG_OFF = phone(20);
const REG_ON = phone(21);
const NEW_STAFF = phone(30);
const ALL_PHONES = [...PHONES, REG_OFF, REG_ON, NEW_STAFF];
const PASSWORD = 'Dash@12345';

let app: Express;
let prisma: PrismaClient;
let request: typeof supertestType;
let sign: (p: { sub: number; role: 'STUDENT' | 'ADMIN' | 'ASSISTANT'; name: string }) => string;
let stats: typeof import('../src/modules/stats/stats.admin.service.js');
let cache: typeof import('../src/lib/cache.js');
let q: typeof import('../src/lib/queue.js');

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const DAY = 86_400_000;
type U = { id: number; token: string };
const u: Record<'admin' | 'assistant' | 's1' | 's2' | 's3', U> = {} as never;
let courseId = 0;
let oldCourseId = 0;
const lessonIds: number[] = [];
const examIds: number[] = [];
let s1DeviceId = 0;
let s3DeviceId = 0;
let settingsBefore: { requirePhoneVerification: boolean; updatedById: number | null; updatedAt: Date } | null = null;

async function cleanup() {
  const users = await prisma.user.findMany({ where: { phone: { in: ALL_PHONES } }, select: { id: true } });
  const ids = users.map((x) => x.id);
  await prisma.exam.deleteMany({ where: { OR: [{ id: { in: examIds } }, { title: { startsWith: T } }] } });
  await prisma.codeBatch.deleteMany({ where: { label: { startsWith: T } } });
  await prisma.course.deleteMany({ where: { title: { startsWith: T } } });
  await prisma.otp.deleteMany({ where: { phone: { in: ALL_PHONES } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { action: 'TEST_P8_META' }] } });
  const logins = await prisma.auditLog.findMany({ where: { action: 'LOGIN', actorId: null }, select: { id: true, meta: true } });
  const ours = logins.filter((l) => ids.includes((l.meta as { userId?: number } | null)?.userId ?? -1)).map((l) => l.id);
  await prisma.auditLog.deleteMany({ where: { id: { in: ours } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

const mkUser = async (n: number, role: 'STUDENT' | 'ADMIN' | 'ASSISTANT', name: string, extra: Record<string, unknown> = {}) => {
  const { hashPassword } = await import('../src/lib/password.js');
  const row = await prisma.user.create({
    data: {
      name,
      phone: phone(n),
      parentPhone: phone(n + 50),
      passwordHash: await hashPassword(PASSWORD),
      isActive: true,
      role,
      ...(role === 'STUDENT' && { grade: 'FOURTH_PRIMARY', wallet: { create: { balance: 0 } } }),
      ...extra,
    },
  });
  return { id: row.id, token: sign({ sub: row.id, role, name }) };
};

beforeAll(async () => {
  await import('dotenv/config');
  process.env.REDIS_URL = 'redis://127.0.0.1:6379/3';
  ({ prisma } = await import('../src/lib/prisma.js'));
  const { createApp } = await import('../src/app.js');
  ({ signAccessToken: sign } = (await import('../src/lib/tokens.js')) as never);
  stats = await import('../src/modules/stats/stats.admin.service.js');
  cache = await import('../src/lib/cache.js');
  q = await import('../src/lib/queue.js');
  request = (await import('supertest')).default;
  app = createApp();
  settingsBefore = await prisma.platformSettings.findUnique({ where: { id: 1 }, select: { requirePhoneVerification: true, updatedById: true, updatedAt: true } });
  await cleanup();

  u.admin = await mkUser(1, 'ADMIN', `${T} أدمن`);
  u.assistant = await mkUser(2, 'ASSISTANT', `${T} مساعد`);
  u.s1 = await mkUser(3, 'STUDENT', `${T} طالب لوحة أول`, { grade: null }); // بلا صف: امتحانات الصف العامة من ملفات أخرى لا تظهر له
  u.s2 = await mkUser(4, 'STUDENT', `${T} طالب لوحة ثاني`, { grade: 'FIFTH_PRIMARY', isActive: false });
  u.s3 = await mkUser(5, 'STUDENT', `${T} طالب لوحة ثالث`);
  await prisma.wallet.update({ where: { userId: u.s1.id }, data: { balance: 777 } });

  courseId = (await prisma.course.create({ data: { title: `${T} كورس`, description: 'اختبار', grade: 'FOURTH_PRIMARY', isPublished: true } })).id;
  oldCourseId = (await prisma.course.create({ data: { title: `${T} كورس قديم`, description: 'اختبار', grade: 'FOURTH_PRIMARY' } })).id;
  for (let i = 1; i <= 3; i++) {
    lessonIds.push((await prisma.lesson.create({ data: { courseId, title: `${T} حصة ${i}`, order: i } })).id);
  }
  await prisma.enrollment.createMany({
    data: [
      { userId: u.s1.id, courseId, source: 'ADMIN', expiresAt: new Date(Date.now() + 30 * DAY) },
      { userId: u.s1.id, courseId: oldCourseId, source: 'CODE', expiresAt: new Date(Date.now() - DAY) },
    ],
  });
  // الحصتان 1 و 2 مكتملتان، والأحدث مشاهدة هي 2
  await prisma.lessonProgress.create({ data: { userId: u.s1.id, lessonId: lessonIds[0]!, percent: 100, completedAt: new Date() } });
  await new Promise((r) => setTimeout(r, 20));
  await prisma.lessonProgress.create({ data: { userId: u.s1.id, lessonId: lessonIds[1]!, percent: 90, completedAt: new Date() } });

  s1DeviceId = (await prisma.device.create({ data: { userId: u.s1.id, deviceFingerprint: 'gate-p8-s1a' } })).id;
  s3DeviceId = (await prisma.device.create({ data: { userId: u.s3.id, deviceFingerprint: 'gate-p8-s3a' } })).id;
}, 60_000);

afterAll(async () => {
  try {
    await cleanup();
    if (settingsBefore) {
      await prisma.platformSettings.update({ where: { id: 1 }, data: settingsBefore });
    }
    for (const key of ['notifications', 'messages'] as const) await q.getQueue(key).obliterate({ force: true });
    await cache.invalidateCache(stats.STATS_CACHE_KEY);
  } finally {
    await q.closeQueues();
    const { redis } = await import('../src/lib/redis.js');
    redis.disconnect();
    await prisma.$disconnect();
  }
});

const refreshTokens = (userId: number) =>
  prisma.refreshToken.create({ data: { userId, tokenHash: crypto.randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + DAY) } });
const liveTokens = (userId: number) => prisma.refreshToken.count({ where: { userId, revokedAt: null } });
const auditRows = (action: string, userId: number) =>
  prisma.auditLog.findMany({ where: { action, actorId: u.admin.id }, select: { meta: true } }).then((r) => r.filter((x) => (x.meta as { userId?: number }).userId === userId));

// ── RBAC ─────────────────────────────────────────────────────────
describe('RBAC', () => {
  const adminEndpoints = (): [string, string, object?][] => [
    ['get', '/api/admin/stats'],
    ['get', '/api/admin/students'],
    ['get', `/api/admin/students/${u.s1.id}`],
    ['patch', `/api/admin/students/${u.s1.id}/status`, { isActive: true }],
    ['post', `/api/admin/students/${u.s1.id}/reset-password`],
    ['delete', `/api/admin/students/${u.s1.id}/devices/${s1DeviceId}`],
    ['get', '/api/admin/staff'],
    ['post', '/api/admin/staff', { name: 'مساعد', phone: NEW_STAFF }],
    ['patch', `/api/admin/staff/${u.assistant.id}/status`, { isActive: false }],
    ['post', `/api/admin/staff/${u.assistant.id}/reset-password`],
    ['get', '/api/admin/settings'],
    ['put', '/api/admin/settings', { requirePhoneVerification: true }],
    ['get', '/api/admin/audit-logs'],
  ];

  it('مسارات الأدمن: بلا توكن 401، الطالب والمساعد 403 — ولا تغيير في القاعدة', async () => {
    const before = await prisma.auditLog.count({ where: { actorId: { in: [u.s1.id, u.assistant.id] } } });
    for (const [method, path, body] of adminEndpoints()) {
      const call = () => (request(app) as unknown as Record<string, (p: string) => supertestType.Test>)[method]!(path);
      expect((await call().send(body)).status, `${method} ${path} anon`).toBe(401);
      expect((await call().set(auth(u.s1.token)).send(body)).status, `${method} ${path} student`).toBe(403);
      expect((await call().set(auth(u.assistant.token)).send(body)).status, `${method} ${path} assistant`).toBe(403);
    }
    expect(await prisma.device.count({ where: { id: s1DeviceId } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.assistant.id } })).isActive).toBe(true);
    expect(await prisma.user.count({ where: { phone: NEW_STAFF } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { actorId: { in: [u.s1.id, u.assistant.id] } } })).toBe(before);
  });

  it('لوحة الطالب: بلا توكن 401، الأدمن والمساعد 403', async () => {
    for (const path of ['/api/me/overview', '/api/me/courses']) {
      expect((await request(app).get(path)).status).toBe(401);
      expect((await request(app).get(path).set(auth(u.admin.token))).status).toBe(403);
      expect((await request(app).get(path).set(auth(u.assistant.token))).status).toBe(403);
    }
  });
});

// ── كتابات الأدمن القديمة: التدقيق داخل نفس المعاملة (سطر واحد لكل عملية ناجحة، ولا شيء للفاشلة) ──
describe('admin writes audited in their transaction', () => {
  it('الكورس: إنشاء/نشر/حذف ← سطر تدقيق واحد لكل عملية؛ الفاشلة (404) بلا سطر', async () => {
    const created = await request(app)
      .post('/api/admin/courses')
      .send({ title: `${T} كورس تدقيق`, description: 'اختبار التدقيق', grade: 'FOURTH_PRIMARY', type: 'MONTHLY', price: 0 })
      .set(auth(u.admin.token));
    expect(created.status).toBe(201);
    const id = created.body.course.id as number;
    expect((await request(app).patch(`/api/admin/courses/${id}/publish`).send({ isPublished: true }).set(auth(u.admin.token))).status).toBe(200);
    expect((await request(app).delete(`/api/admin/courses/${id}`).set(auth(u.admin.token))).status).toBe(200);
    expect((await request(app).delete(`/api/admin/courses/${id}`).set(auth(u.admin.token))).status).toBe(404);
    const rows = await prisma.auditLog.findMany({ where: { actorId: u.admin.id, entity: 'Course' }, orderBy: { id: 'asc' } });
    const mine = rows.filter((r) => (r.meta as { courseId?: number }).courseId === id).map((r) => r.action);
    expect(mine).toEqual(['COURSE_CREATE', 'COURSE_PUBLISH', 'COURSE_DELETE']);
  });

  it('تعطيل كود: سطر تدقيق مع التعطيل، والتكرار (409) بلا سطر ثانٍ', async () => {
    const batch = await prisma.codeBatch.create({ data: { label: `${T} دفعة تدقيق`, value: 1_000, count: 1, createdBy: u.admin.id } });
    const code = await prisma.redeemCode.create({ data: { codeHash: crypto.randomBytes(32).toString('hex'), value: 1_000, batchId: batch.id } });
    expect((await request(app).patch(`/api/admin/codes/${code.id}/disable`).set(auth(u.admin.token))).status).toBe(200);
    expect((await request(app).patch(`/api/admin/codes/${code.id}/disable`).set(auth(u.admin.token))).status).toBe(409);
    const rows = await prisma.auditLog.findMany({ where: { actorId: u.admin.id, action: 'CODE_DISABLE' } });
    expect(rows.filter((r) => (r.meta as { codeId?: number }).codeId === code.id)).toHaveLength(1);
  });

  it('توكن سليم لمستخدم غير موجود ← 401 (الحارس يفحص الحساب لا التوقيع فقط)', async () => {
    const ghost = sign({ sub: 2_000_000_000, role: 'ADMIN', name: 'شبح' });
    const r = await request(app).get('/api/admin/stats').set(auth(ghost));
    expect(r.status).toBe(401);
  });
});

// ── الطلاب ───────────────────────────────────────────────────────
describe('admin students', () => {
  it('بحث بجزء من الموبايل + ترقيم (الأحدث أولاً) + بلا passwordHash', async () => {
    const p1 = await request(app).get('/api/admin/students').query({ q: P, pageSize: 2 }).set(auth(u.admin.token));
    expect(p1.status).toBe(200);
    expect(p1.headers['cache-control']).toBe('no-store');
    expect(p1.body).toMatchObject({ total: 3, page: 1, pageSize: 2, totalPages: 2 });
    expect(p1.body.items.map((x: { id: number }) => x.id)).toEqual([u.s3.id, u.s2.id]);
    const p2 = await request(app).get('/api/admin/students').query({ q: P, pageSize: 2, page: 2 }).set(auth(u.admin.token));
    expect(p2.body.items.map((x: { id: number }) => x.id)).toEqual([u.s1.id]);
    expect(p2.body.items[0]).toMatchObject({ balance: 777, activeEnrollments: 1, isActive: true, grade: null });
    expect(JSON.stringify([p1.body, p2.body])).not.toMatch(/passwordHash|argon2/);
  });

  it('بحث بالاسم العربي، وفلتر الصف والحالة', async () => {
    const byName = await request(app).get('/api/admin/students').query({ q: 'طالب لوحة ثاني' }).set(auth(u.admin.token));
    expect(byName.body.items.map((x: { id: number }) => x.id)).toEqual([u.s2.id]);
    const byGrade = await request(app).get('/api/admin/students').query({ q: P, grade: 'FIFTH_PRIMARY' }).set(auth(u.admin.token));
    expect(byGrade.body.items.map((x: { id: number }) => x.id)).toEqual([u.s2.id]);
    const inactive = await request(app).get('/api/admin/students').query({ q: P, status: 'inactive' }).set(auth(u.admin.token));
    expect(inactive.body.items.map((x: { id: number }) => x.id)).toEqual([u.s2.id]);
    // الأدمن والمساعد ليسا طلاباً
    const staff = await request(app).get('/api/admin/students').query({ q: `${T} أدمن` }).set(auth(u.admin.token));
    expect(staff.body.total).toBe(0);
  });

  it('تحقق الاستعلام: كل قاعدة وحدها ← 400 على حقلها', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ q: 'a' }, 'q'],
      [{ q: 'x'.repeat(61) }, 'q'],
      [{ grade: 'BAD' }, 'grade'],
      [{ status: 'banned' }, 'status'],
      [{ page: 0 }, 'page'],
      [{ pageSize: 51 }, 'pageSize'],
    ];
    for (const [query, field] of cases) {
      const r = await request(app).get('/api/admin/students').query(query).set(auth(u.admin.token));
      expect(r.status, field).toBe(400);
      expect(Object.keys(r.body.fields)).toEqual([field]);
    }
    // حقل بحث فارغ = بلا فلتر (ليس 400)
    expect((await request(app).get('/api/admin/students').query({ q: '' }).set(auth(u.admin.token))).status).toBe(200);
  });

  it('التفاصيل: اشتراكات وأجهزة ونجوم بلا passwordHash؛ غير الطالب/غير الموجود 404؛ معرّف ضخم 400', async () => {
    const r = await request(app).get(`/api/admin/students/${u.s1.id}`).set(auth(u.admin.token));
    expect(r.status).toBe(200);
    const s = r.body.student;
    expect(s).toMatchObject({ id: u.s1.id, stars: 2, balance: 777, deviceLimit: 2 });
    expect(s.enrollments).toHaveLength(2);
    expect(s.enrollments.filter((e: { active: boolean }) => e.active)).toHaveLength(1);
    expect(s.devices.map((d: { id: number }) => d.id)).toEqual([s1DeviceId]);
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|argon2/);
    for (const id of [u.admin.id, u.assistant.id, 2_000_000_000]) {
      expect((await request(app).get(`/api/admin/students/${id}`).set(auth(u.admin.token))).status).toBe(404);
    }
    expect((await request(app).get('/api/admin/students/3000000000').set(auth(u.admin.token))).status).toBe(400);
    // /students/lookup ما زال يصل لمساره (المعرّف أرقام فقط)
    const lookup = await request(app).get('/api/admin/students/lookup').query({ phone: phone(3) }).set(auth(u.admin.token));
    expect(lookup.status).toBe(200);
    expect(lookup.body.id ?? lookup.body.student?.id).toBe(u.s1.id);
  });

  it('التعطيل: يُنهي الجلسات، التجديد يُرفض، تدقيق مرة واحدة؛ ثم التفعيل', async () => {
    await refreshTokens(u.s1.id);
    // توكن صادر قبل دقيقة (أقدم من التعطيل بثوانٍ كاملة مهما كانت سرعة الاختبار)
    u.s1.token = sign({ sub: u.s1.id, role: 'STUDENT', name: 's1', iat: Math.floor(Date.now() / 1000) - 60 } as never);
    // توكن الوصول الحالي يعمل قبل التعطيل، ويُرفض فوراً بعده (لا ينتظر انتهاء صلاحيته)
    expect((await request(app).get('/api/me/courses').set(auth(u.s1.token))).status).toBe(200);
    const off = await request(app).patch(`/api/admin/students/${u.s1.id}/status`).send({ isActive: false }).set(auth(u.admin.token));
    expect(off.status).toBe(200);
    expect(off.body).toEqual({ id: u.s1.id, isActive: false });
    expect(await liveTokens(u.s1.id)).toBe(0);
    const blocked = await request(app).get('/api/me/courses').set(auth(u.s1.token));
    expect(blocked.status).toBe(401);
    expect(blocked.body.message).toBe('الحساب معطّل');
    // تكرار نفس الحالة ← لا تدقيق ثانٍ
    await request(app).patch(`/api/admin/students/${u.s1.id}/status`).send({ isActive: false }).set(auth(u.admin.token));
    expect(await auditRows('USER_DEACTIVATE', u.s1.id)).toHaveLength(1);
    expect((await request(app).patch(`/api/admin/students/${u.s1.id}/status`).send({ isActive: true }).set(auth(u.admin.token))).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.s1.id } })).isActive).toBe(true);
    expect(await auditRows('USER_ACTIVATE', u.s1.id)).toHaveLength(1);
    // التفعيل لا يُحيي الجلسات المنتهية: توكن ما قبل التعطيل مرفوض، ودخول جديد يعمل
    expect((await request(app).get('/api/me/courses').set(auth(u.s1.token))).status).toBe(401);
    u.s1.token = sign({ sub: u.s1.id, role: 'STUDENT', name: 's1', iat: Math.floor(Date.now() / 1000) + 1 } as never);
    expect((await request(app).get('/api/me/courses').set(auth(u.s1.token))).status).toBe(200);
  });

  it('تحقق الحالة: نوع خاطئ، حقل زائد، بلا جسم ← 400؛ وحساب مساعد عبر مسار الطلاب 404', async () => {
    for (const body of [{ isActive: 'yes' }, { isActive: true, role: 'ADMIN' }, {}]) {
      const r = await request(app).patch(`/api/admin/students/${u.s1.id}/status`).send(body).set(auth(u.admin.token));
      expect(r.status).toBe(400);
    }
    const r = await request(app).patch(`/api/admin/students/${u.assistant.id}/status`).send({ isActive: false }).set(auth(u.admin.token));
    expect(r.status).toBe(404);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.assistant.id } })).isActive).toBe(true);
  });

  it('إعادة تعيين كلمة المرور: مؤقتة تعمل مرة العرض فقط، الجلسات تنتهي، والسجل بلا كلمة المرور', async () => {
    await refreshTokens(u.s3.id);
    const r = await request(app).post(`/api/admin/students/${u.s3.id}/reset-password`).set(auth(u.admin.token));
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.tempPassword).toMatch(/^[a-zA-Z2-9]{10}$/);
    const { verifyPassword } = await import('../src/lib/password.js');
    const row = await prisma.user.findUniqueOrThrow({ where: { id: u.s3.id } });
    expect(await verifyPassword(row.passwordHash, r.body.tempPassword)).toBe(true);
    expect(await verifyPassword(row.passwordHash, PASSWORD)).toBe(false);
    expect(await liveTokens(u.s3.id)).toBe(0);
    const audits = await auditRows('USER_PASSWORD_RESET', u.s3.id);
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits)).not.toContain(r.body.tempPassword);
    expect((await request(app).post(`/api/admin/students/${u.admin.id}/reset-password`).set(auth(u.admin.token))).status).toBe(404);
  });

  it('إزالة جهاز: جهاز طالب آخر 404 (IDOR) ولا يُحذف؛ جهازه ← يُحذف وتنتهي الجلسات؛ التكرار 404', async () => {
    const idor = await request(app).delete(`/api/admin/students/${u.s1.id}/devices/${s3DeviceId}`).set(auth(u.admin.token));
    expect(idor.status).toBe(404);
    expect(await prisma.device.count({ where: { id: s3DeviceId } })).toBe(1);
    await refreshTokens(u.s1.id);
    // حالة ثابتة بدقة الثانية: إنهاء سابق قبل دقيقتين وتوكن صادر بعده بدقيقة — يعمل قبل الإزالة ويسقط بعدها
    await prisma.user.update({ where: { id: u.s1.id }, data: { sessionsRevokedAt: new Date(Date.now() - 120_000) } });
    (await import('../src/lib/userStatus.js')).forgetUserStatus(u.s1.id);
    u.s1.token = sign({ sub: u.s1.id, role: 'STUDENT', name: 's1', iat: Math.floor(Date.now() / 1000) - 60 } as never);
    expect((await request(app).get('/api/me/courses').set(auth(u.s1.token))).status).toBe(200);
    const ok = await request(app).delete(`/api/admin/students/${u.s1.id}/devices/${s1DeviceId}`).set(auth(u.admin.token));
    expect(ok.status).toBe(200);
    expect(await prisma.device.count({ where: { id: s1DeviceId } })).toBe(0);
    expect(await liveTokens(u.s1.id)).toBe(0);
    // توكن الوصول الحالي يسقط فوراً أيضاً (الجهاز المفقود لا يبقى داخلاً 15 دقيقة) ← دخول جديد لبقية الملف
    expect((await request(app).get('/api/me/courses').set(auth(u.s1.token))).status).toBe(401);
    u.s1.token = sign({ sub: u.s1.id, role: 'STUDENT', name: 's1', iat: Math.floor(Date.now() / 1000) + 1 } as never);
    expect(await auditRows('USER_DEVICE_REMOVE', u.s1.id)).toHaveLength(1);
    expect((await request(app).delete(`/api/admin/students/${u.s1.id}/devices/${s1DeviceId}`).set(auth(u.admin.token))).status).toBe(404);
    expect((await request(app).delete(`/api/admin/students/${u.s1.id}/devices/3000000000`).set(auth(u.admin.token))).status).toBe(400);
  });
});

// ── المساعدون + حد الأجهزة للطلاب فقط ────────────────────────────────
describe('admin staff', () => {
  let newId = 0;
  let temp = '';

  it('إنشاء مساعد: 201 بكلمة مؤقتة تُعرض مرة، يظهر في القائمة، والتكرار 409', async () => {
    const r = await request(app).post('/api/admin/staff').send({ name: `${T} مساعد جديد`, phone: NEW_STAFF, email: '' }).set(auth(u.admin.token));
    expect(r.status).toBe(201);
    expect(r.body.staff).toMatchObject({ role: 'ASSISTANT', isActive: true, phone: NEW_STAFF, email: null });
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash/);
    newId = r.body.staff.id;
    temp = r.body.tempPassword;
    const list = await request(app).get('/api/admin/staff').set(auth(u.admin.token));
    expect(list.body.items.map((x: { id: number }) => x.id)).toEqual(expect.arrayContaining([newId, u.admin.id, u.assistant.id]));
    expect(list.body.items.every((x: { role: string }) => x.role !== 'STUDENT')).toBe(true);
    const dup = await request(app).post('/api/admin/staff').send({ name: `${T} مكرر`, phone: NEW_STAFF }).set(auth(u.admin.token));
    expect(dup.status).toBe(409);
    expect((await prisma.auditLog.findMany({ where: { action: 'STAFF_CREATE', actorId: u.admin.id } })).length).toBe(1);
  });

  it('تحقق الإنشاء: كل قاعدة وحدها ← 400 على حقلها', async () => {
    const ok = { name: `${T} مساعد`, phone: phone(31) };
    const cases: [Record<string, unknown>, string][] = [
      [{ ...ok, name: 'ab' }, 'name'],
      [{ ...ok, phone: '0123' }, 'phone'],
      [{ ...ok, email: 'not-mail' }, 'email'],
      [{ ...ok, role: 'ADMIN' }, ''],
    ];
    for (const [body, field] of cases) {
      const r = await request(app).post('/api/admin/staff').send(body).set(auth(u.admin.token));
      expect(r.status, field).toBe(400);
      expect(Object.keys(r.body.fields)).toEqual([field]);
    }
    expect(await prisma.user.count({ where: { phone: phone(31) } })).toBe(0);
  });

  it('المساعد يدخل بالكلمة المؤقتة من 3 أجهزة (حد الأجهزة للطلاب فقط)، والتعطيل يمنع الدخول', async () => {
    for (const fp of ['gate-p8-st-a', 'gate-p8-st-b', 'gate-p8-st-c']) {
      const r = await request(app).post('/api/auth/login').send({ identifier: NEW_STAFF, password: temp, deviceFingerprint: fp });
      expect(r.status, fp).toBe(200);
    }
    expect(await prisma.device.count({ where: { userId: newId } })).toBe(3);
    expect((await request(app).patch(`/api/admin/staff/${newId}/status`).send({ isActive: false }).set(auth(u.admin.token))).status).toBe(200);
    expect(await liveTokens(newId)).toBe(0);
    const denied = await request(app).post('/api/auth/login').send({ identifier: NEW_STAFF, password: temp, deviceFingerprint: 'gate-p8-st-a' });
    expect(denied.status).toBe(403);
  });

  it('الأدمن والطالب لا يُعدَّلان من مسار المساعدين (404)، وإعادة تعيين المساعد تعمل', async () => {
    for (const id of [u.admin.id, u.s1.id]) {
      expect((await request(app).patch(`/api/admin/staff/${id}/status`).send({ isActive: false }).set(auth(u.admin.token))).status).toBe(404);
      expect((await request(app).post(`/api/admin/staff/${id}/reset-password`).set(auth(u.admin.token))).status).toBe(404);
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.admin.id } })).isActive).toBe(true);
    const r = await request(app).post(`/api/admin/staff/${newId}/reset-password`).set(auth(u.admin.token));
    expect(r.status).toBe(200);
    expect(r.body.tempPassword).not.toBe(temp);
  });
});

// ── إعدادات المنصة: التسجيل بتحقق أو بدونه ──────────────────────────
describe('platform settings', () => {
  const reg = (p: string) =>
    request(app)
      .post('/api/auth/register')
      .send({ name: `${T} تسجيل`, phone: p, parentPhone: phone(99), password: PASSWORD, confirmPassword: PASSWORD, grade: 'FOURTH_PRIMARY', governorate: 'القاهرة' });

  it('تحقق التعديل: نوع خاطئ، حقل زائد، بلا جسم ← 400', async () => {
    for (const body of [{ requirePhoneVerification: 'no' }, { requirePhoneVerification: true, x: 1 }, {}]) {
      expect((await request(app).put('/api/admin/settings').send(body).set(auth(u.admin.token))).status).toBe(400);
    }
  });

  it('بدون تحقق: الحساب مفعّل فوراً ولا كود ولا رسالة؛ بتحقق: غير مفعّل + كود — والتدقيق من/إلى', async () => {
    const off = await request(app).put('/api/admin/settings').send({ requirePhoneVerification: false }).set(auth(u.admin.token));
    expect(off.status).toBe(200);
    expect(off.body.settings).toMatchObject({ requirePhoneVerification: false, updatedBy: { id: u.admin.id } });
    const r1 = await reg(REG_OFF);
    expect(r1.status).toBe(201);
    expect(r1.body).toMatchObject({ requiresVerification: false });
    const a = await prisma.user.findUniqueOrThrow({ where: { phone: REG_OFF } });
    expect(a.isActive).toBe(true);
    expect(await prisma.otp.count({ where: { phone: REG_OFF } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: a.id } })).toBe(0);

    expect((await request(app).put('/api/admin/settings').send({ requirePhoneVerification: true }).set(auth(u.admin.token))).status).toBe(200);
    const r2 = await reg(REG_ON);
    expect(r2.body).toMatchObject({ requiresVerification: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { phone: REG_ON } })).isActive).toBe(false);
    expect(await prisma.otp.count({ where: { phone: REG_ON } })).toBe(1);

    const audits = await prisma.auditLog.findMany({ where: { action: 'SETTINGS_UPDATE', actorId: u.admin.id }, orderBy: { id: 'asc' } });
    expect(audits.map((x) => x.meta)).toEqual([
      { field: 'requirePhoneVerification', from: settingsBefore?.requirePhoneVerification ?? true, to: false },
      { field: 'requirePhoneVerification', from: false, to: true },
    ]);
    const g = await request(app).get('/api/admin/settings').set(auth(u.admin.token));
    expect(g.body.settings.requirePhoneVerification).toBe(true);
  });
});

// ── سجل العمليات ─────────────────────────────────────────────────
describe('audit log viewer', () => {
  it('فلتر العملية والمنفّذ + ترقيم؛ الدخول يُنسب لصاحب الحساب', async () => {
    const r = await request(app).get('/api/admin/audit-logs').query({ actorId: u.admin.id, action: 'USER_ACTIVATE' }).set(auth(u.admin.token));
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThan(0);
    expect(r.body.items.every((x: { action: string; actor: { id: number } }) => x.action === 'USER_ACTIVATE' && x.actor.id === u.admin.id)).toBe(true);
    const all = await request(app).get('/api/admin/audit-logs').query({ actorId: u.admin.id, pageSize: 2 }).set(auth(u.admin.token));
    expect(all.body.pageSize).toBe(2);
    expect(all.body.totalPages).toBe(Math.ceil(all.body.total / 2));
    const ids = all.body.items.map((x: { id: number }) => x.id);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    const login = await request(app).get('/api/admin/audit-logs').query({ action: 'LOGIN', pageSize: 50 }).set(auth(u.admin.token));
    const staffLogin = login.body.items.find((x: { actor: { name: string } | null }) => x.actor?.name === `${T} مساعد جديد`);
    expect(staffLogin).toBeTruthy();
  });

  it('meta آمن: المفاتيح السرية محذوفة (حتى المتداخلة)، والنص يُرجع كنص', async () => {
    await prisma.auditLog.create({
      data: {
        actorId: u.admin.id,
        action: 'TEST_P8_META',
        entity: 'Test',
        meta: { password: 'p-SECRET', refreshToken: 't-SECRET', nested: { secretKey: 'k-SECRET', ok: 1 }, note: '<img src=x onerror=alert(1)>' },
      },
    });
    const r = await request(app).get('/api/admin/audit-logs').query({ action: 'TEST_P8_META' }).set(auth(u.admin.token));
    expect(r.body.items).toHaveLength(1);
    const meta = r.body.items[0].meta as { key: string; value: string }[];
    expect(meta.map((m) => m.key).sort()).toEqual(['nested', 'note']);
    expect(JSON.stringify(meta)).not.toContain('SECRET');
    expect(meta.find((m) => m.key === 'nested')!.value).toBe('{"ok":1}');
    expect(meta.find((m) => m.key === 'note')!.value).toBe('<img src=x onerror=alert(1)>');
  });

  it('تحقق الفلاتر: كل قاعدة وحدها ← 400 على حقلها', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ action: 'drop table' }, 'action'],
      [{ entity: '1User' }, 'entity'],
      [{ actorId: 'abc' }, 'actorId'],
      [{ from: '2026-01-01' }, 'from'],
      [{ from: '2026-02-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' }, 'to'],
      [{ pageSize: 0 }, 'pageSize'],
    ];
    for (const [query, field] of cases) {
      const r = await request(app).get('/api/admin/audit-logs').query(query).set(auth(u.admin.token));
      expect(r.status, field).toBe(400);
      expect(Object.keys(r.body.fields)).toEqual([field]);
    }
    const range = await request(app)
      .get('/api/admin/audit-logs')
      .query({ actorId: u.admin.id, from: new Date(Date.now() - DAY).toISOString(), to: new Date(Date.now() + DAY).toISOString() })
      .set(auth(u.admin.token));
    expect(range.status).toBe(200);
    expect(range.body.total).toBeGreaterThan(0);
  });
});

// ── إحصائيات الأدمن ───────────────────────────────────────────────
describe('admin stats', () => {
  it('بداية يوم القاهرة بالتوقيت الصيفي والشتوي', () => {
    expect(stats.cairoMidnight('2026-09-30').toISOString()).toBe('2026-09-29T21:00:00.000Z');
    expect(stats.cairoMidnight('2026-01-15').toISOString()).toBe('2026-01-14T22:00:00.000Z');
  });

  // يوم مستقبلي لا يكتب فيه أحد غيرنا ← الأرقام اليومية دقيقة حتى مع ملفات اختبار متوازية.
  // 22:30 بتوقيت القاهرة (20:30Z، الشتوي +2) ← نفس اليوم في القاهرة واليوم التالي لا يدخل؛ وبداية الشهر 1 مارس ← الشهر يشمل اليومين
  it('الأرقام بتوقيت القاهرة: دفع أونلاين + كارت مستخدم + اشتراك + طالب جديد في يوم معزول', async () => {
    const now = new Date('2030-03-10T20:30:00.000Z');
    const yesterday = new Date('2030-03-09T21:30:00.000Z'); // 23:30 القاهرة يوم 9
    const before = await stats.computeStats(now);
    const pay = await prisma.payment.create({ data: { userId: u.s1.id, amount: 12_345, status: 'PAID', purpose: 'TOPUP', paidAt: now, createdAt: now } });
    // PENDING لا تُحتسب إيراداً
    await prisma.payment.create({ data: { userId: u.s1.id, amount: 99_999, status: 'PENDING', purpose: 'TOPUP', createdAt: now } });
    await prisma.payment.create({ data: { userId: u.s1.id, amount: 1_000, status: 'PAID', purpose: 'TOPUP', paidAt: yesterday, createdAt: yesterday } });
    const batch = await prisma.codeBatch.create({ data: { label: `${T} دفعة`, value: 5_000, count: 1, createdBy: u.admin.id } });
    await prisma.redeemCode.create({
      data: { codeHash: crypto.randomBytes(32).toString('hex'), value: 5_000, batchId: batch.id, status: 'USED', usedByUserId: u.s1.id, usedAt: now },
    });
    await prisma.enrollment.create({ data: { userId: u.s3.id, courseId, source: 'WALLET', createdAt: now, expiresAt: new Date('2031-01-01T00:00:00Z') } });
    await mkUser(6, 'STUDENT', `${T} طالب جديد`, { createdAt: now });
    const after = await stats.computeStats(now);

    expect(after.kpis.revenueToday).toEqual({ online: 12_345, codes: 5_000, total: 17_345 });
    expect(after.kpis.revenueMonth).toEqual({ online: 13_345, codes: 5_000, total: 18_345 });
    expect(after.kpis.activeEnrollments - before.kpis.activeEnrollments).toBe(1);
    expect(after.kpis.usedCodes - before.kpis.usedCodes).toBeGreaterThanOrEqual(1);
    expect(after.daily).toHaveLength(30);
    expect(after.daily.at(-1)).toEqual({ day: '2030-03-10', online: 12_345, codes: 5_000, enrollments: 1, students: 1 });
    expect(after.daily.at(-2)).toEqual({ day: '2030-03-09', online: 1_000, codes: 0, enrollments: 0, students: 0 });
    expect(after.daily[0]!.day).toBe('2030-02-09');
    expect(after.latestPayments.map((p) => p.id)).toContain(pay.id);
    expect(after.latestEnrollments[0]).toMatchObject({ user: { id: u.s3.id }, course: { id: courseId } });
  });

  it('الـ endpoint: كاش قصير (نفس generatedAt) ويتجدد بعد الإبطال', async () => {
    await cache.invalidateCache(stats.STATS_CACHE_KEY);
    const a = await request(app).get('/api/admin/stats').set(auth(u.admin.token));
    expect(a.status).toBe(200);
    expect(a.headers['cache-control']).toBe('no-store');
    await new Promise((r) => setTimeout(r, 50));
    const b = await request(app).get('/api/admin/stats').set(auth(u.admin.token));
    expect(b.body.generatedAt).toBe(a.body.generatedAt);
    await cache.invalidateCache(stats.STATS_CACHE_KEY);
    const c = await request(app).get('/api/admin/stats').set(auth(u.admin.token));
    expect(c.body.generatedAt).not.toBe(a.body.generatedAt);
  });
});

// ── لوحة الطالب ───────────────────────────────────────────────────
describe('student dashboard', () => {
  beforeAll(async () => {
    const mkExam = async (title: string, resultRelease: 'IMMEDIATE' | 'MANUAL') => {
      const e = await prisma.exam.create({ data: { title: `${T} ${title}`, courseId, grade: 'FOURTH_PRIMARY', durationMin: 10, resultRelease } });
      examIds.push(e.id);
      const qn = await prisma.question.create({ data: { examId: e.id, type: 'MCQ', text: 'سؤال', points: 1, choices: { create: [{ text: 'صح', isCorrect: true }] } } });
      return { examId: e.id, questionId: qn.id };
    };
    const now = new Date();
    for (const [title, release] of [['امتحان فوري', 'IMMEDIATE'], ['امتحان يدوي', 'MANUAL']] as const) {
      const { examId, questionId } = await mkExam(title, release);
      await prisma.examAttempt.create({
        data: { examId, userId: u.s1.id, deadlineAt: now, submittedAt: now, gradedAt: now, status: 'SUBMITTED', score: 1, totalPoints: 1, questionOrder: [questionId] },
      });
    }
    await mkExam('امتحان مفتوح', 'IMMEDIATE');
    await prisma.homework.create({ data: { courseId, title: `${T} واجب` } });
    // s2 كان معطّلاً لاختبارات الفلترة؛ الحساب المعطّل يُرفض الآن عند الحارس (401) ← نفعّله لاختبار IDOR
    await prisma.user.update({ where: { id: u.s2.id }, data: { isActive: true } });
  });

  it('كورساتي: الساري أولاً، التقدّم لكل كورس، و"كمّل من" أول حصة غير مكتملة', async () => {
    const r = await request(app).get('/api/me/courses').set(auth(u.s1.token));
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.items).toHaveLength(2);
    expect(r.body.items[0]).toMatchObject({ courseId, active: true, lessonsCount: 3, completedLessons: 2, percent: 67, nextLessonId: lessonIds[2] });
    expect(r.body.items[1]).toMatchObject({ courseId: oldCourseId, active: false, lessonsCount: 0, percent: 0, nextLessonId: null });
  });

  it('النظرة العامة: الرصيد والنجوم وآخر حصة، والنتائج المعلنة فقط، والامتحانات والواجبات المطلوبة', async () => {
    const r = await request(app).get('/api/me/overview').set(auth(u.s1.token));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ balance: 777, stars: 2, activeCoursesCount: 1, upcomingExams: 1, requiredHomework: 1 });
    expect(r.body.lastLesson).toMatchObject({ lessonId: lessonIds[1], courseId });
    expect(r.body.recentResults.map((x: { title: string }) => x.title)).toEqual([`${T} امتحان فوري`]);
  });

  it('IDOR: كل طالب يرى بياناته هو فقط', async () => {
    const r = await request(app).get('/api/me/overview').set(auth(u.s2.token));
    expect(r.body).toMatchObject({ balance: 0, stars: 0, activeCoursesCount: 0, lastLesson: null, recentResults: [] });
    expect((await request(app).get('/api/me/courses').set(auth(u.s2.token))).body.items).toEqual([]);
  });
});

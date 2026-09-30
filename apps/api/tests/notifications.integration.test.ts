// اختبارات تكامل الإشعارات (Phase 7) على القاعدة الحقيقية + Redis معزول (قاعدة 1) + مزوّد وهمي HTTP:
// التسليم وإعادة المحاولة والبديل SMS والمهلة، الإرسال مرة واحدة فقط، إشعار ولي الأمر من التسليم للوصول،
// التذكير وتنبيه الانتهاء، الإرسال الجماعي، القوالب، الصندوق (IDOR/ترقيم/تحقق) و RBAC، وعدم حجب الطلب.
// عمّال خادم التطوير على قاعدة Redis 0 فلا يلمسون jobs هذا الملف. كل البيانات بأرقام 0155596xxxx
// وعناوين TEST-P7، وتُحذف بالمعرّفات/العناوين الدقيقة في النهاية.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import type supertestType from 'supertest';
import { Queue, Worker, type Job } from 'bullmq';

// ── مزوّد وهمي (واتساب + SMS) ─────────────────────────────────────
type Kind = 'wa' | 'sms';
type Mode = 'ok' | 'fail500' | 'fail400' | 'hang';
interface Call {
  kind: Kind;
  at: number;
  auth: string;
  to: string;
  text: string;
}
const calls: Call[] = [];
const behave: Record<Kind, (n: number) => Mode> = { wa: () => 'ok', sms: () => 'ok' };
const hanging: http.ServerResponse[] = [];
const counts: Record<Kind, number> = { wa: 0, sms: 0 };

const mock = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const kind: Kind = req.url!.startsWith('/wa') ? 'wa' : 'sms';
    const body = JSON.parse(raw || '{}');
    const text = kind === 'wa' ? body.text?.body : body.text;
    calls.push({ kind, at: Date.now(), auth: String(req.headers.authorization), to: body.to, text });
    const mode = behave[kind](counts[kind]++);
    if (mode === 'hang') return void hanging.push(res);
    res.setHeader('content-type', 'application/json');
    // رد الخطأ يردد المفتاح والرقم عمداً: يجب ألا يظهرا في lastError
    if (mode === 'fail500') return void res.writeHead(500).end(JSON.stringify({ error: { message: `upstream down auth=${req.headers.authorization} to=${body.to}` } }));
    if (mode === 'fail400') return void res.writeHead(400).end(JSON.stringify({ error: { message: 'invalid recipient' } }));
    res.end(JSON.stringify(kind === 'wa' ? { messages: [{ id: `wamid.${counts.wa}` }] } : { id: `sms-${counts.sms}` }));
  });
});
await new Promise<void>((r) => mock.listen(0, '127.0.0.1', r));
const port = (mock.address() as AddressInfo).port;

const WA_TOKEN = 'p7-test-wa-token-SECRET';
const SMS_KEY = 'p7-test-sms-key-SECRET';
process.env.WHATSAPP_TOKEN = WA_TOKEN;
process.env.WHATSAPP_PHONE_ID = '1234567890';
process.env.WHATSAPP_API_URL = `http://127.0.0.1:${port}/wa`;
process.env.SMS_PROVIDER_URL = `http://127.0.0.1:${port}/sms`;
process.env.SMS_API_KEY = SMS_KEY;
process.env.REDIS_URL = 'redis://127.0.0.1:6379/1';

const setMode = (wa: Mode | ((n: number) => Mode), sms: Mode | ((n: number) => Mode)) => {
  behave.wa = typeof wa === 'function' ? wa : () => wa;
  behave.sms = typeof sms === 'function' ? sms : () => sms;
  counts.wa = 0;
  counts.sms = 0;
};

// ── بيانات الاختبار ───────────────────────────────────────────────
const P = '0155596';
const T = 'TEST-P7';
const PHONES = ['0001', '0002', '0003', '0004', '0050', '0098', '0099', '0097'].map((s) => `${P}${s}`);
const PARENT = (i: number) => `${P}900${i}`;
const COURSE_TITLES = [`${T} كورس`, `${T} كورس فارغ`];
const CUSTOM_KEY = 'test_p7_welcome';

let app: Express;
let prisma: PrismaClient;
let request: typeof supertestType;
let sign: (p: { sub: number; role: 'STUDENT' | 'ADMIN' | 'ASSISTANT'; name: string }) => string;
let q: typeof import('../src/lib/queue.js');
let producers: typeof import('../src/modules/notifications/producers.js');
let delivery: typeof import('../src/modules/notifications/delivery.js');
let outbox: typeof import('../src/modules/notifications/outbox.js');
let workers: Worker[] = [];

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const DAY = 24 * 60 * 60_000;
const st: Record<'s1' | 's2' | 's3', { id: number; token: string; name: string; phone: string }> = {} as never;
let adminId = 0;
let adminToken = '';
let admin2Token = '';
let assistantToken = '';
let courseId = 0;
let emptyCourseId = 0;
const examIds: number[] = [];
const broadcastIds: number[] = [];
let templatesBefore: { key: string; channel: string }[] = [];

async function eventually<V>(fn: () => Promise<V>, ok: (v: V) => boolean, ms = 8000): Promise<V> {
  const t0 = Date.now();
  let v = await fn();
  while (!ok(v) && Date.now() - t0 < ms) {
    await new Promise((r) => setTimeout(r, 100));
    v = await fn();
  }
  return v;
}

async function timed<V>(fn: () => Promise<V>): Promise<{ res: V; ms: number }> {
  const t0 = performance.now();
  const res = await fn();
  return { res, ms: performance.now() - t0 };
}

const fakeJob = (id: number, attemptsMade = 0, attempts = 5, code?: string) =>
  ({ data: { id, ...(code && { code }) }, attemptsMade, opts: { attempts } }) as never;

// رسالة صادرة PENDING مباشرة في القاعدة (لا تُدفع للطابور) — لاختبار التسليم بالاستدعاء المباشر
let marker = 0;
async function outbound(userId: number, extra: Record<string, unknown> = {}) {
  const body = `${T} رسالة ${++marker}-${Date.now()}`;
  const n = await prisma.notification.create({
    data: { userId, type: 'GENERAL', channel: 'WHATSAPP', status: 'PENDING', toPhone: st.s1.phone, title: T, body, ...extra },
  });
  return { id: n.id, body };
}
const row = (id: number) => prisma.notification.findUniqueOrThrow({ where: { id } });

async function cleanup() {
  const users = await prisma.user.findMany({ where: { phone: { in: PHONES } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.exam.deleteMany({ where: { id: { in: examIds } } });
  await prisma.notificationBroadcast.deleteMany({ where: { id: { in: broadcastIds } } });
  await prisma.course.deleteMany({ where: { title: { in: COURSE_TITLES } } });
  await prisma.otp.deleteMany({ where: { phone: { in: PHONES } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  // القوالب: المخصّص الذي أنشأناه، وتجاوزات النظام التي لم تكن موجودة قبل الاختبار
  const keep = new Set(templatesBefore.map((t) => `${t.key}:${t.channel}`));
  const now = await prisma.notificationTemplate.findMany({ select: { id: true, key: true, channel: true } });
  const ours = now.filter((t) => !keep.has(`${t.key}:${t.channel}`)).map((t) => t.id);
  await prisma.notificationTemplate.deleteMany({ where: { id: { in: ours } } });
}

const mkUser = (phone: string, role: 'STUDENT' | 'ADMIN' | 'ASSISTANT', name: string, parentPhone = '01000000002', grade?: 'FOURTH_PRIMARY' | 'FIFTH_PRIMARY') =>
  prisma.user.create({
    data: { name, phone, parentPhone, passwordHash: 'x', isActive: true, role, ...(role === 'STUDENT' && { grade: grade ?? 'FOURTH_PRIMARY' }) },
  });

beforeAll(async () => {
  await import('dotenv/config');
  ({ prisma } = await import('../src/lib/prisma.js'));
  const { createApp } = await import('../src/app.js');
  ({ signAccessToken: sign } = (await import('../src/lib/tokens.js')) as never);
  q = await import('../src/lib/queue.js');
  producers = await import('../src/modules/notifications/producers.js');
  delivery = await import('../src/modules/notifications/delivery.js');
  outbox = await import('../src/modules/notifications/outbox.js');
  request = (await import('supertest')).default;
  app = createApp();

  templatesBefore = await prisma.notificationTemplate.findMany({ select: { key: true, channel: true } });
  await cleanup();
  for (const [i, k] of (['s1', 's2', 's3'] as const).entries()) {
    const u = await mkUser(PHONES[i]!, 'STUDENT', `طالب إشعارات ${i + 1}`, PARENT(i + 1), k === 's3' ? 'FIFTH_PRIMARY' : 'FOURTH_PRIMARY');
    st[k] = { id: u.id, name: u.name, phone: u.phone, token: sign({ sub: u.id, role: 'STUDENT', name: u.name }) };
  }
  const admin = await mkUser(`${P}0099`, 'ADMIN', 'أدمن إشعارات');
  adminId = admin.id;
  adminToken = sign({ sub: admin.id, role: 'ADMIN', name: admin.name });
  const admin2 = await mkUser(`${P}0097`, 'ADMIN', 'أدمن إشعارات 2');
  admin2Token = sign({ sub: admin2.id, role: 'ADMIN', name: admin2.name });
  const assistant = await mkUser(`${P}0098`, 'ASSISTANT', 'مساعد إشعارات');
  assistantToken = sign({ sub: assistant.id, role: 'ASSISTANT', name: assistant.name });

  courseId = (
    await prisma.course.create({
      data: { title: COURSE_TITLES[0]!, description: 'اختبار', grade: 'FOURTH_PRIMARY', type: 'MONTHLY', price: 1000, isPublished: true },
    })
  ).id;
  emptyCourseId = (
    await prisma.course.create({ data: { title: COURSE_TITLES[1]!, description: 'اختبار', grade: 'FOURTH_PRIMARY', type: 'MONTHLY', price: 1000 } })
  ).id;
  // s1، s2 مشتركان ساريان؛ s3 اشتراكه منتهٍ ← لا يستلم إشعارات الكورس
  await prisma.enrollment.createMany({
    data: [
      { userId: st.s1.id, courseId, source: 'ADMIN', expiresAt: new Date(Date.now() + 30 * DAY) },
      { userId: st.s2.id, courseId, source: 'ADMIN', expiresAt: new Date(Date.now() + 30 * DAY) },
      { userId: st.s3.id, courseId, source: 'ADMIN', expiresAt: new Date(Date.now() - DAY) },
    ],
  });

  // عمّال هذا الملف على Redis المعزول بالمزوّد الوهمي
  const { JOBS } = q;
  const notificationsProcessor = (job: Job) => {
    if (job.name === JOBS.parentExamResult) return producers.parentExamResultJob(job as never);
    if (job.name === JOBS.broadcast) return producers.broadcastJob(job as never);
    if (job.name === JOBS.liveReminder) return producers.liveReminderJob(job as never);
    return Promise.resolve(null);
  };
  workers = [
    new Worker(q.QUEUES.notifications, notificationsProcessor, { connection: q.createQueueConnection() }),
    new Worker(q.QUEUES.messages, (job) => delivery.deliverMessageJob(job as never), { connection: q.createQueueConnection(), concurrency: 5 }),
  ];
}, 30_000);

afterAll(async () => {
  await Promise.all(workers.map((w) => w.close()));
  // Redis المعزول (قاعدة 1) يحوي jobs هذا الملف فقط ← حذف طوابيره بالكامل
  for (const key of ['notifications', 'messages', 'exams'] as const) await q.getQueue(key).obliterate({ force: true });
  await cleanup();
  await q.closeQueues();
  await prisma.$disconnect();
  for (const res of hanging) res.destroy();
  mock.closeAllConnections();
  await new Promise((r) => mock.close(r));
});

// ── التسليم: المزوّد، البديل، إعادة المحاولة، المهلة، مرة واحدة فقط ─────────
describe('delivery', () => {
  it('واتساب ← SENT مع معرّف المزوّد؛ المفتاح في الترويسة والرقم بالصيغة الدولية', async () => {
    setMode('ok', 'ok');
    const { id, body } = await outbound(st.s1.id);
    expect(await delivery.deliverMessageJob(fakeJob(id))).toEqual({ sent: 'whatsapp' });
    const r = await row(id);
    expect(r).toMatchObject({ status: 'SENT', channel: 'WHATSAPP', attempts: 1, lastError: null, lockedUntil: null });
    expect(r.providerMessageId).toMatch(/^wamid\./);
    expect(r.sentAt).not.toBeNull();
    const call = calls.find((c) => c.text === body)!;
    expect(call).toMatchObject({ kind: 'wa', auth: `Bearer ${WA_TOKEN}`, to: `20${st.s1.phone.slice(1)}` });
  });

  it('مرة واحدة فقط: تسليمان متزامنان لنفس الرسالة ← استدعاء واحد للمزوّد، وتسليم لاحق بعد SENT لا شيء', async () => {
    setMode('ok', 'ok');
    const { id, body } = await outbound(st.s1.id);
    const [a, b] = await Promise.all([delivery.deliverMessageJob(fakeJob(id)), delivery.deliverMessageJob(fakeJob(id))]);
    expect([a, b].filter((r) => 'sent' in r)).toHaveLength(1);
    expect([a, b].filter((r) => 'skipped' in r)).toHaveLength(1);
    expect(await delivery.deliverMessageJob(fakeJob(id))).toEqual({ skipped: true });
    expect(calls.filter((c) => c.text === body)).toHaveLength(1);
    expect((await row(id)).attempts).toBe(1);
  });

  it('فشل واتساب (500) ← البديل SMS ينجح؛ القناة SMS ويبقى سبب فشل واتساب بلا أسرار', async () => {
    setMode('fail500', 'ok');
    const { id, body } = await outbound(st.s1.id);
    expect(await delivery.deliverMessageJob(fakeJob(id))).toEqual({ sent: 'sms' });
    const r = await row(id);
    expect(r).toMatchObject({ status: 'SENT', channel: 'SMS', attempts: 1 });
    expect(r.providerMessageId).toMatch(/^sms-/);
    expect(r.lastError).toContain('WhatsApp 500');
    expect(r.lastError).not.toContain(WA_TOKEN);
    expect(r.lastError).not.toContain(`20${st.s1.phone.slice(1)}`);
    const mine = calls.filter((c) => c.text === body);
    expect(mine.map((c) => c.kind)).toEqual(['wa', 'sms']);
    expect(mine[1]!.auth).toBe(`Bearer ${SMS_KEY}`);
  });

  it('فشل المزوّدين مؤقتاً ← يُرمى للإعادة ويبقى PENDING؛ المحاولة الأخيرة ← FAILED مع آخر خطأ', async () => {
    setMode('fail500', 'fail500');
    const { id } = await outbound(st.s1.id);
    await expect(delivery.deliverMessageJob(fakeJob(id, 0, 5))).rejects.toThrow(/WhatsApp 500.*SMS 500/);
    let r = await row(id);
    expect(r).toMatchObject({ status: 'PENDING', attempts: 1, lockedUntil: null });
    expect(r.lastError).toMatch(/WhatsApp 500.*SMS 500/);
    // المحاولة الخامسة (attemptsMade=4 من 5)
    await expect(delivery.deliverMessageJob(fakeJob(id, 4, 5))).rejects.toThrow();
    r = await row(id);
    expect(r).toMatchObject({ status: 'FAILED', attempts: 2, sentAt: null });
    for (const secret of [WA_TOKEN, SMS_KEY, `20${st.s1.phone.slice(1)}`]) expect(r.lastError).not.toContain(secret);
    // FAILED نهائي: تسليم إضافي لا يرسل
    const before = calls.length;
    expect(await delivery.deliverMessageJob(fakeJob(id, 0, 5))).toEqual({ skipped: true });
    expect(calls.length).toBe(before);
  });

  it('خطأ دائم (400 من الاثنين) ← FAILED من أول محاولة ولا إعادة (UnrecoverableError)', async () => {
    setMode('fail400', 'fail400');
    const { id } = await outbound(st.s1.id);
    const err = await delivery.deliverMessageJob(fakeJob(id, 0, 5)).catch((e: Error) => e);
    expect((err as Error).name).toBe('UnrecoverableError');
    expect(await row(id)).toMatchObject({ status: 'FAILED', attempts: 1 });
  });

  it('مهلة المزوّد: واتساب لا يرد ← يُقطع بعد المهلة ويكمل SMS', async () => {
    setMode('hang', 'ok');
    const { id } = await outbound(st.s1.id);
    const { res, ms } = await timed(() => delivery.deliverMessageJob(fakeJob(id)));
    expect(res).toEqual({ sent: 'sms' });
    expect(ms).toBeGreaterThanOrEqual(9_500);
    expect(ms).toBeLessThan(14_000);
    expect((await row(id)).lastError).toContain('انتهت مهلة المزوّد');
  }, 20_000);

  it('BullMQ فعلياً: إعادة المحاولة بـ backoff حتى ينجح البديل، ثم FAILED بعد آخر محاولة', async () => {
    const name = 'test-p7-retry';
    const queue = new Queue(name, { connection: q.createQueueConnection() });
    const worker = new Worker(name, (job) => delivery.deliverMessageJob(job as never), { connection: q.createQueueConnection() });
    try {
      // واتساب يفشل دائماً، SMS يفشل مرتين ثم ينجح
      setMode('fail500', (n) => (n < 2 ? 'fail500' : 'ok'));
      const ok = await outbound(st.s1.id);
      await queue.add('deliver', { id: ok.id }, { jobId: `p7-${ok.id}`, attempts: 3, backoff: { type: 'fixed', delay: 400 } });
      const r1 = await eventually(() => row(ok.id), (r) => r.status !== 'PENDING', 10_000);
      expect(r1).toMatchObject({ status: 'SENT', channel: 'SMS', attempts: 3 });
      const sms = calls.filter((c) => c.text === ok.body && c.kind === 'sms').map((c) => c.at);
      expect(sms).toHaveLength(3);
      expect(sms[1]! - sms[0]!).toBeGreaterThanOrEqual(350);
      expect(sms[2]! - sms[1]!).toBeGreaterThanOrEqual(350);

      setMode('fail500', 'fail500');
      const bad = await outbound(st.s1.id);
      await queue.add('deliver', { id: bad.id }, { jobId: `p7-${bad.id}`, attempts: 3, backoff: { type: 'exponential', delay: 200 } });
      const r2 = await eventually(() => row(bad.id), (r) => r.status !== 'PENDING', 10_000);
      expect(r2).toMatchObject({ status: 'FAILED', attempts: 3 });
      expect(r2.lastError).toMatch(/WhatsApp 500.*SMS 500/);
      const job = await queue.getJob(`p7-${bad.id}`);
      expect(await job!.getState()).toBe('failed');
      expect(job!.attemptsMade).toBe(3);
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  }, 20_000);
});

// ── كود التحقق ────────────────────────────────────────────────────
describe('OTP', () => {
  it('نسيت كلمة المرور: الطلب لا ينتظر المزوّد، الكود لا يُخزَّن نصاً، والتسليم يرسله للرقم', async () => {
    setMode('ok', 'ok');
    const before = calls.length;
    const msgWorker = workers[1]!;
    await msgWorker.pause();
    try {
      setMode('hang', 'hang');
      const { res, ms } = await timed(() => request(app).post('/api/auth/forgot-password').send({ phone: st.s2.phone }));
      expect(res.status).toBe(200);
      expect(ms).toBeLessThan(1000);
      expect(calls.length).toBe(before);
    } finally {
      setMode('ok', 'ok');
      msgWorker.resume();
    }
    const n = await eventually(
      () => prisma.notification.findFirst({ where: { userId: st.s2.id, type: 'OTP' }, orderBy: { id: 'desc' } }),
      (r) => r?.status === 'SENT',
    );
    expect(n).toMatchObject({ status: 'SENT', channel: 'WHATSAPP', toPhone: st.s2.phone });
    // القاعدة: نص مُقنَّع بلا أي كود؛ المزوّد: النص الحقيقي بكود من 6 أرقام يطابق الـ hash المخزّن
    expect(n!.body).toContain('••••••');
    expect(n!.body).not.toMatch(/\d{6}/);
    const sent = calls.find((c) => c.to === `20${st.s2.phone.slice(1)}` && /\d{6}/.test(c.text))!;
    const code = sent.text.match(/\d{6}/)![0];
    // توكن صادر قبل دقيقة (أقدم من الاستعادة بثوانٍ كاملة مهما كانت سرعة الاختبار)
    st.s2.token = sign({ sub: st.s2.id, role: 'STUDENT', name: st.s2.name, iat: Math.floor(Date.now() / 1000) - 60 } as never);
    const reset = await request(app).post('/api/auth/reset-password').send({ phone: st.s2.phone, code, newPassword: 'NewPass@123' });
    expect(reset.status).toBe(200);
    // الاستعادة تُنهي كل الجلسات (توكن الوصول القديم مرفوض) ← دخول جديد لبقية الملف
    expect((await request(app).get('/api/notifications/unread-count').set(auth(st.s2.token))).status).toBe(401);
    st.s2.token = sign({ sub: st.s2.id, role: 'STUDENT', name: st.s2.name, iat: Math.floor(Date.now() / 1000) + 1 } as never);
    // الـ job (وبياناته بالكود) لا يبقى في Redis
    expect(await q.getQueue('messages').getJob(outbox.messageJobId(n!.id))).toBeFalsy();
  });

  it('التسجيل: 201 فوراً ورسالة التفعيل للمستخدم الجديد عبر الطابور', async () => {
    const phone = `${P}0050`;
    const { res, ms } = await timed(() =>
      request(app).post('/api/auth/register').send({
        name: 'طالب تسجيل P7',
        phone,
        parentPhone: PARENT(5),
        password: 'Student@123',
        confirmPassword: 'Student@123',
        grade: 'FOURTH_PRIMARY',
        governorate: 'القاهرة',
      }),
    );
    expect(res.status).toBe(201);
    expect(ms).toBeLessThan(1500); // يشمل تجزئة argon2 لكلمة المرور؛ لا انتظار لأي مزوّد
    const user = await prisma.user.findUniqueOrThrow({ where: { phone } });
    const n = await eventually(() => prisma.notification.findFirst({ where: { userId: user.id, type: 'OTP' } }), (r) => r?.status === 'SENT');
    expect(n!.body).not.toMatch(/\d{6}/);
    expect(calls.some((c) => c.to === `20${phone.slice(1)}` && /\d{6}/.test(c.text))).toBe(true);
  });

  it('سقف الأكواد لكل رقم: 3 خلال النافذة؛ الرابع لا يُنشئ كوداً والرد نفسه (لا تعداد)', async () => {
    const phone = st.s3.phone;
    for (let i = 0; i < 4; i++) expect((await request(app).post('/api/auth/forgot-password').send({ phone })).status).toBe(200);
    expect(await prisma.otp.count({ where: { phone } })).toBe(3);
    expect(await prisma.notification.count({ where: { userId: st.s3.id, type: 'OTP' } })).toBe(3);
  });

  it('رسالة OTP بلا كود في الـ job (إعادة من الكنّاس) ← FAILED ولا تُرسل النص المُقنَّع', async () => {
    const { id } = await outbound(st.s1.id, { type: 'OTP', body: 'كودك: ••••••' });
    const before = calls.length;
    expect(await delivery.deliverMessageJob(fakeJob(id))).toEqual({ failed: true });
    expect(calls.length).toBe(before);
    expect((await row(id)).status).toBe('FAILED');
    // مع الكود: يُستبدل في الرسالة المرسلة فقط
    setMode('ok', 'ok');
    const second = await outbound(st.s1.id, { type: 'OTP', body: 'كودك: ••••••' });
    await delivery.deliverMessageJob(fakeJob(second.id, 0, 3, '482913'));
    expect(calls.at(-1)!.text).toBe('كودك: 482913');
    expect((await row(second.id)).body).toBe('كودك: ••••••');
  });
});

// ── الكنّاس: حجز يتيم لعامل انقطع (مثلاً job تجاوز حد التعطّل في BullMQ) ──
describe('sweeper', () => {
  it('حجز منتهٍ و job غير حي ← FAILED بلا إعادة إرسال؛ و job حي (مؤجّل) ← يبقى PENDING لعامله', async () => {
    const past = new Date(Date.now() - 60_000);
    const dead = await outbound(st.s1.id, { lockedUntil: past, attempts: 1 });
    const live = await outbound(st.s1.id, { lockedUntil: past, attempts: 1 });
    const messages = q.getQueue('messages');
    await messages.add(q.JOBS.deliverMessage, { id: live.id }, { jobId: outbox.messageJobId(live.id), delay: 60_000 });
    try {
      const r = await outbox.flushNotificationOutbox();
      expect(r.orphaned).toBeGreaterThanOrEqual(1);
      const d = await row(dead.id);
      expect(d).toMatchObject({ status: 'FAILED', lockedUntil: null, attempts: 1 });
      expect(d.lastError).toContain('انقطع العامل');
      expect((await row(live.id)).status).toBe('PENDING');
      // الكنّاس لا يرسل الرسالة اليتيمة (لا تكرار محتمل)
      await new Promise((res) => setTimeout(res, 300));
      expect(calls.filter((c) => c.text === dead.body || c.text === live.body)).toHaveLength(0);
    } finally {
      await (await messages.getJob(outbox.messageJobId(live.id)))?.remove();
    }
  });
});

// ── إشعار ولي الأمر: من تسليم الطالب حتى وصول الرسالة للمزوّد ───────
describe('parent exam result', () => {
  let attemptId = 0;
  let examTitle = '';

  it('يصل فعلياً بعد التسليم والتصحيح، بنص القالب ولرقم ولي الأمر — والتسليم لا ينتظر', async () => {
    setMode('ok', 'ok');
    examTitle = `${T} امتحان ${Date.now()}`;
    const created = await request(app)
      .post('/api/admin/exams')
      .set(auth(adminToken))
      .send({ title: examTitle, grade: 'FOURTH_PRIMARY', courseId, durationMin: 10, resultRelease: 'IMMEDIATE', notifyParent: true });
    expect(created.status).toBe(201);
    const examId = created.body.exam.id as number;
    examIds.push(examId);
    for (const [text, correct] of [['س1', true], ['س2', false]] as const) {
      const qr = await request(app)
        .post(`/api/admin/exams/${examId}/questions`)
        .set(auth(adminToken))
        .send({ type: 'TRUEFALSE', text, points: 1, choices: [{ text: 'صح', isCorrect: correct }, { text: 'خطأ', isCorrect: !correct }] });
      expect(qr.status).toBe(201);
    }
    const pub = await request(app).patch(`/api/admin/exams/${examId}`).set(auth(adminToken)).send({ isPublished: true });
    expect(pub.status).toBe(200);

    const start = await request(app).post(`/api/exams/${examId}/start`).set(auth(st.s1.token));
    expect(start.status).toBe(200);
    attemptId = start.body.attemptId;
    // إجابة صحيحة للأول فقط ← 1/2
    const qs = pub.body.exam.questions as { id: number; choices: { id: number; isCorrect: boolean }[] }[];
    const right = qs[0]!.choices.find((c) => c.isCorrect)!.id;
    expect((await request(app).patch(`/api/attempts/${attemptId}/answer`).set(auth(st.s1.token)).send({ questionId: qs[0]!.id, choiceId: right })).status).toBe(200);

    const { res: submitted, ms } = await timed(() => request(app).post(`/api/attempts/${attemptId}/submit`).set(auth(st.s1.token)));
    expect(submitted.status).toBe(200);
    expect(submitted.body.score).toBe(1);
    expect(ms).toBeLessThan(1500);

    const expected = `ابنك/بنتك ${st.s1.name} حصل على 1/2 في امتحان ${examTitle}`;
    const n = await eventually(
      () => prisma.notification.findUnique({ where: { dedupeKey: `parent-result:${attemptId}` } }),
      (r) => r?.status === 'SENT',
    );
    expect(n).toMatchObject({ type: 'PARENT_EXAM_RESULT', channel: 'WHATSAPP', status: 'SENT', toPhone: PARENT(1), body: expected, userId: st.s1.id, attempts: 1 });
    const delivered = calls.filter((c) => c.text === expected);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ kind: 'wa', to: `20${PARENT(1).slice(1)}` });
    expect((await prisma.examAttempt.findUniqueOrThrow({ where: { id: attemptId } })).parentNotifiedAt).not.toBeNull();
    // لا يظهر في صندوق الطالب (رسالة صادرة لولي الأمر)
    const inbox = await request(app).get('/api/notifications').set(auth(st.s1.token));
    expect(inbox.body.items.some((i: { type: string }) => i.type === 'PARENT_EXAM_RESULT')).toBe(false);
  }, 20_000);

  it('idempotency: دفعان إضافيان + الكنّاس + إعادة دفع التسليم ← رسالة واحدة وإرسال واحد', async () => {
    const { queueParentNotification, flushParentOutbox } = await import('../src/modules/exams/exams.service.js');
    const expected = `ابنك/بنتك ${st.s1.name} حصل على 1/2 في امتحان ${examTitle}`;
    // job الإشعار الأول انتهى ← نزيله حتى يُنشأ job جديد بنفس المعرّف فعلاً (لا يكفي تجاهل Redis للمكرر)
    await (await q.getQueue('notifications').getJob(`parent-result-${attemptId}`))?.remove();
    await prisma.examAttempt.update({ where: { id: attemptId }, data: { parentNotifyQueuedAt: null } });
    await Promise.all([queueParentNotification(attemptId), queueParentNotification(attemptId), flushParentOutbox(500)]);
    await eventually(
      async () => (await q.getQueue('notifications').getJob(`parent-result-${attemptId}`))?.getState(),
      (s) => s === 'completed',
    );
    // وإعادة دفع job التسليم نفسه بعد إزالته (كما يفعل الكنّاس) ← حارس الحالة SENT يمنع الإرسال
    const n = await prisma.notification.findUniqueOrThrow({ where: { dedupeKey: `parent-result:${attemptId}` } });
    await (await q.getQueue('messages').getJob(outbox.messageJobId(n.id)))?.remove();
    await outbox.dispatchMessages([n.id, n.id]);
    await eventually(async () => (await q.getQueue('messages').getJob(outbox.messageJobId(n.id)))?.getState(), (s) => s === 'completed');
    expect(await prisma.notification.count({ where: { userId: st.s1.id, type: 'PARENT_EXAM_RESULT' } })).toBe(1);
    expect(calls.filter((c) => c.text === expected)).toHaveLength(1);
    expect((await row(n.id)).attempts).toBe(1);
  }, 20_000);
});

// ── تذكير اللايف وتنبيه الانتهاء ──────────────────────────────────
describe('live reminder + expiry warnings', () => {
  it('التذكير: إشعار داخلي + واتساب لكل مشترك ساري فقط، مرة واحدة، ويتجاهل الـ job القديم', async () => {
    setMode('ok', 'ok');
    const startAt = new Date(Date.now() + 3 * 60 * 60_000);
    const s = await prisma.liveSession.create({
      data: { courseId, title: `${T} لايف`, provider: 'ZOOM', joinUrl: 'https://zoom.us/j/7', startAt, durationMin: 30 },
    });
    const job = (iso: string) => ({ data: { sessionId: s.id, startAt: iso } }) as never;
    expect(await producers.liveReminderJob(job(startAt.toISOString()))).toEqual({ recipients: 2 });
    expect(await producers.liveReminderJob(job(startAt.toISOString()))).toEqual({ recipients: 2 });
    const rows = await prisma.notification.findMany({ where: { type: 'LIVE_REMINDER', dedupeKey: { startsWith: `live:${s.id}:` } } });
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.userId))).toEqual(new Set([st.s1.id, st.s2.id]));
    const inApp = rows.find((r) => r.channel === 'IN_APP' && r.userId === st.s1.id)!;
    expect(inApp.body).toContain(`${T} لايف`);
    expect(inApp.body).not.toContain('zoom.us'); // الرابط لا يُرسل خارج نافذة الانضمام
    await eventually(() => prisma.notification.count({ where: { id: { in: rows.map((r) => r.id) }, channel: 'WHATSAPP', status: 'SENT' } }), (c) => c === 2);
    expect(await producers.liveReminderJob(job(new Date(startAt.getTime() - 60_000).toISOString()))).toEqual({ skipped: true, reason: 'stale' });
    await prisma.liveSession.delete({ where: { id: s.id } });
  });

  it('قرب الانتهاء: مرة واحدة لكل اشتراك لكل تاريخ انتهاء، والتجديد يعيد التنبيه للموعد الجديد', async () => {
    // "الآن" في المستقبل البعيد: لا اشتراك حقيقي ينتهي حوله — فقط اشتراكات الاختبار
    const now = new Date('2090-01-01T00:00:00Z');
    await prisma.enrollment.updateMany({ where: { userId: st.s1.id, courseId }, data: { expiresAt: new Date(now.getTime() + 2 * DAY) } });
    await prisma.enrollment.updateMany({ where: { userId: st.s2.id, courseId }, data: { expiresAt: new Date(now.getTime() + 10 * DAY) } });
    expect(await producers.expiryWarningsJob(now)).toEqual({ checked: 1 });
    await producers.expiryWarningsJob(now);
    const where = { type: 'ENROLLMENT_EXPIRY' as const, channel: 'IN_APP' as const };
    expect(await prisma.notification.count({ where: { ...where, userId: st.s1.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { ...where, userId: st.s2.id } })).toBe(0);
    await prisma.enrollment.updateMany({ where: { userId: st.s1.id, courseId }, data: { expiresAt: new Date(now.getTime() + 3 * DAY) } });
    await producers.expiryWarningsJob(now);
    expect(await prisma.notification.count({ where: { ...where, userId: st.s1.id } })).toBe(2);
    // إرجاع الاشتراكات لسريانها الطبيعي
    await prisma.enrollment.updateMany({ where: { userId: { in: [st.s1.id, st.s2.id] }, courseId }, data: { expiresAt: new Date(Date.now() + 30 * DAY) } });
  });
});

// ── صندوق الإشعارات: الملكية والترقيم والتحقق ─────────────────────
describe('inbox endpoints', () => {
  const inboxRows = (userId: number, n: number, title = `${T} إشعار`) =>
    prisma.notification.createMany({ data: Array.from({ length: n }, (_, i) => ({ userId, title: `${title} ${i + 1}`, body: 'نص' })) });

  beforeAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [st.s1.id, st.s2.id] }, channel: 'IN_APP' } });
    await inboxRows(st.s1.id, 25);
    await inboxRows(st.s2.id, 3, `${T} لغيره`);
  });

  it('401 بلا توكن', async () => {
    expect((await request(app).get('/api/notifications')).status).toBe(401);
    expect((await request(app).get('/api/notifications/unread-count')).status).toBe(401);
    expect((await request(app).patch('/api/notifications/read-all')).status).toBe(401);
  });

  it('ترقيم: الأحدث أولاً، 20 ثم 5، إشعاراته فقط، والعدّاد', async () => {
    const p1 = await request(app).get('/api/notifications').set(auth(st.s1.token));
    expect(p1.status).toBe(200);
    expect(p1.headers['cache-control']).toBe('no-store');
    expect(p1.body).toMatchObject({ total: 25, page: 1, pageSize: 20, totalPages: 2, unread: 25 });
    expect(p1.body.items).toHaveLength(20);
    expect(p1.body.items[0].title).toBe(`${T} إشعار 25`);
    const ids = p1.body.items.map((i: { id: number }) => i.id);
    expect([...ids].sort((a, b) => b - a)).toEqual(ids);
    const p2 = await request(app).get('/api/notifications?page=2').set(auth(st.s1.token));
    expect(p2.body.items).toHaveLength(5);
    expect(p2.body.items.every((i: { title: string }) => i.title.startsWith(`${T} إشعار`))).toBe(true);
    const c = await request(app).get('/api/notifications/unread-count').set(auth(st.s1.token));
    expect(c.body).toEqual({ count: 25 });
  });

  it('تحقق الاستعلام: كل قاعدة وحدها ← 400 على حقلها', async () => {
    for (const [qs, field] of [
      ['filter=bogus', 'filter'],
      ['pageSize=51', 'pageSize'],
      ['page=0', 'page'],
    ] as const) {
      const r = await request(app).get(`/api/notifications?${qs}`).set(auth(st.s1.token));
      expect(r.status, qs).toBe(400);
      expect(Object.keys(r.body.fields)).toEqual([field]);
    }
    // نفس المعاملات بقيم صالحة ← 200
    expect((await request(app).get('/api/notifications?filter=unread&pageSize=50&page=1').set(auth(st.s1.token))).status).toBe(200);
  });

  it('قراءة إشعار: ملكه ← 200 والعدّاد ينقص؛ إشعار غيره/رسالة صادرة/غير موجود ← 404 بنفس الرد', async () => {
    const mine = await prisma.notification.findFirstOrThrow({ where: { userId: st.s1.id, channel: 'IN_APP', isRead: false } });
    const theirs = await prisma.notification.findFirstOrThrow({ where: { userId: st.s2.id, channel: 'IN_APP', isRead: false } });
    const outboundOwn = await outbound(st.s1.id);
    const ok = await request(app).patch(`/api/notifications/${mine.id}/read`).set(auth(st.s1.token));
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ unread: 24 });
    const notFoundBody = { message: 'الإشعار غير موجود', code: 'NOT_FOUND' };
    for (const id of [theirs.id, outboundOwn.id, 2_000_000_000]) {
      const r = await request(app).patch(`/api/notifications/${id}/read`).set(auth(st.s1.token));
      expect(r.status).toBe(404);
      expect(r.body).toEqual(notFoundBody);
    }
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).isRead).toBe(false);
    for (const bad of ['abc', '0', '-1', '2147483648', '1.5']) {
      expect((await request(app).patch(`/api/notifications/${bad}/read`).set(auth(st.s1.token))).status, bad).toBe(400);
    }
    const unread = await request(app).get('/api/notifications?filter=unread').set(auth(st.s1.token));
    expect(unread.body.total).toBe(24);
    expect(unread.body.items.every((i: { isRead: boolean }) => !i.isRead)).toBe(true);
  });

  it('قراءة الكل: إشعاراته فقط', async () => {
    const r = await request(app).patch('/api/notifications/read-all').set(auth(st.s1.token));
    expect(r.status).toBe(200);
    expect(r.body.updated).toBeGreaterThanOrEqual(24);
    expect((await request(app).get('/api/notifications/unread-count').set(auth(st.s1.token))).body).toEqual({ count: 0 });
    expect((await request(app).get('/api/notifications/unread-count').set(auth(st.s2.token))).body.count).toBeGreaterThanOrEqual(3);
    // مكرر ← لا شيء
    expect((await request(app).patch('/api/notifications/read-all').set(auth(st.s1.token))).body).toEqual({ updated: 0 });
  });

  it('الأدمن والمساعد لهما صندوق خاص (نفس المسارات)', async () => {
    const r = await request(app).get('/api/notifications').set(auth(assistantToken));
    expect(r.status).toBe(200);
    expect(r.body.items).toEqual([]);
  });
});

// ── الأدمن: الصلاحيات، الإرسال الجماعي، القوالب، سجل الرسائل ─────────
describe('admin notifications', () => {
  const validBroadcast = () => ({ title: `${T} إعلان`, body: 'أهلاً {name}، حصة مراجعة غداً', audience: 'COURSE', courseId, alsoWhatsapp: true });

  it('RBAC: الطالب والمساعد 403، وبلا توكن 401 — على كل المسارات', async () => {
    const routes: [string, string][] = [
      ['post', '/api/admin/notifications/broadcast'],
      ['get', '/api/admin/notifications/broadcasts'],
      ['get', '/api/admin/notifications/messages'],
      ['get', '/api/admin/notifications/templates'],
      ['post', '/api/admin/notifications/templates'],
      ['put', '/api/admin/notifications/templates/otp/WHATSAPP'],
      ['delete', '/api/admin/notifications/templates/otp/WHATSAPP'],
    ];
    for (const [method, url] of routes) {
      const call = (t?: string) => {
        const r = (request(app) as unknown as Record<string, (u: string) => supertestType.Test>)[method]!(url);
        return t ? r.set(auth(t)) : r;
      };
      expect((await call()).status, `${method} ${url}`).toBe(401);
      expect((await call(st.s1.token).send(validBroadcast())).status, `${method} ${url}`).toBe(403);
      expect((await call(assistantToken).send(validBroadcast())).status, `${method} ${url}`).toBe(403);
    }
    expect(await prisma.notificationBroadcast.count({ where: { title: `${T} إعلان` } })).toBe(0);
  });

  it('تحقق الإرسال الجماعي: كل قاعدة على حمولة صالحة فيما عداها ← 400 على حقلها وحده', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ audience: 'GRADE', courseId: undefined }, 'grade'],
      [{ courseId: undefined }, 'courseId'],
      [{ audience: 'ALL', courseId: undefined, grade: 'FOURTH_PRIMARY' }, 'grade'],
      [{ audience: 'GRADE', grade: 'FOURTH_PRIMARY' }, 'courseId'],
      [{ body: 'رقمك {phone}' }, 'body'],
      [{ title: 'كودك {code}' }, 'title'],
      [{ title: 'ا' }, 'title'],
      [{ audience: 'EVERYONE' }, 'audience'],
      [{ alsoWhatsapp: 'yes' }, 'alsoWhatsapp'],
      [{ courseId: 2_147_483_648 }, 'courseId'],
      [{ userIds: [1, 2] }, ''],
    ];
    for (const [patch, field] of cases) {
      const r = await request(app).post('/api/admin/notifications/broadcast').set(auth(adminToken)).send({ ...validBroadcast(), ...patch });
      expect(r.status, JSON.stringify(patch)).toBe(400);
      expect(Object.keys(r.body.fields), JSON.stringify(patch)).toEqual([field]);
    }
    const missing = await request(app).post('/api/admin/notifications/broadcast').set(auth(adminToken)).send({ ...validBroadcast(), courseId: 2_000_000_000 });
    expect(missing.status).toBe(404);
    expect(await prisma.notificationBroadcast.count({ where: { title: `${T} إعلان` } })).toBe(0);
  });

  it('إرسال جماعي لمشتركي كورس: 202 فوراً (المزوّد معلّق)، ثم توزيع على الساريين فقط + واتساب + تدقيق', async () => {
    const msgWorker = workers[1]!;
    await msgWorker.pause();
    setMode('hang', 'hang');
    const before = calls.length;
    const { res, ms } = await timed(() => request(app).post('/api/admin/notifications/broadcast').set(auth(adminToken)).send(validBroadcast()));
    expect(res.status).toBe(202);
    expect(ms).toBeLessThan(1000);
    expect(calls.length).toBe(before);
    const id = res.body.broadcast.id as number;
    broadcastIds.push(id);
    expect(res.body.broadcast).toMatchObject({ audience: 'COURSE', courseId, courseTitle: COURSE_TITLES[0], completedAt: null });

    const done = await eventually(() => prisma.notificationBroadcast.findUniqueOrThrow({ where: { id } }), (b) => b.completedAt !== null);
    expect(done.recipients).toBe(2);
    const rows = await prisma.notification.findMany({ where: { broadcastId: id }, orderBy: { id: 'asc' } });
    expect(rows.filter((r) => r.channel === 'IN_APP').map((r) => r.userId).sort()).toEqual([st.s1.id, st.s2.id].sort());
    const s1Row = rows.find((r) => r.channel === 'IN_APP' && r.userId === st.s1.id)!;
    expect(s1Row.body).toBe(`أهلاً ${st.s1.name}، حصة مراجعة غداً`);
    expect(rows.filter((r) => r.channel === 'WHATSAPP' && r.status === 'PENDING')).toHaveLength(2);

    // التسليم يستأنف بعد عودة المزوّد
    setMode('ok', 'ok');
    msgWorker.resume();
    await eventually(() => prisma.notification.count({ where: { broadcastId: id, channel: 'WHATSAPP', status: 'SENT' } }), (c) => c === 2);
    expect(calls.filter((c) => c.text === `${T} إعلان\n\nأهلاً ${st.s2.name}، حصة مراجعة غداً`)).toHaveLength(1);

    // عدّاد الطالب زاد، وإعادة التوزيع لا تكرر
    expect((await request(app).get('/api/notifications/unread-count').set(auth(st.s1.token))).body.count).toBeGreaterThanOrEqual(1);
    await prisma.notificationBroadcast.update({ where: { id }, data: { completedAt: null } });
    await producers.broadcastJob({ data: { broadcastId: id } } as never);
    expect(await prisma.notification.count({ where: { broadcastId: id } })).toBe(4);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { actorId: adminId, action: 'NOTIF_BROADCAST' }, orderBy: { id: 'desc' } });
    expect(audit.meta).toMatchObject({ broadcastId: id, audience: 'COURSE', courseId });

    const list = await request(app).get('/api/admin/notifications/broadcasts?pageSize=1').set(auth(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.items[0]).toMatchObject({ id, recipients: 2, messages: { SENT: 2, FAILED: 0, PENDING: 0 } });
    expect(list.body.pageSize).toBe(1);
    expect((await request(app).get('/api/admin/notifications/broadcasts?pageSize=51').set(auth(adminToken))).status).toBe(400);
  }, 20_000);

  it('سقف الإرسال الجماعي: 5 خلال 10 دقائق لكل أدمن، والسادس 429 بلا حفظ', async () => {
    const payload = { title: `${T} سقف`, body: 'تنبيه', audience: 'COURSE', courseId: emptyCourseId };
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post('/api/admin/notifications/broadcast').set(auth(admin2Token)).send(payload);
      expect(r.status).toBe(202);
      broadcastIds.push(r.body.broadcast.id);
    }
    const sixth = await request(app).post('/api/admin/notifications/broadcast').set(auth(admin2Token)).send(payload);
    expect(sixth.status).toBe(429);
    expect(await prisma.notificationBroadcast.count({ where: { title: `${T} سقف` } })).toBe(5);
  });

  it('سجل الرسائل: حسب الحالة، الرقم مُقنَّع، والحالة غير الصالحة 400', async () => {
    const failed = await request(app).get('/api/admin/notifications/messages?status=FAILED&pageSize=50').set(auth(adminToken));
    expect(failed.status).toBe(200);
    const mine = failed.body.items.filter((m: { userName: string }) => m.userName === st.s1.name);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((m: { toPhone: string; status: string }) => m.status === 'FAILED' && m.toPhone === '015*****001')).toBe(true);
    expect(JSON.stringify(failed.body)).not.toContain(st.s1.phone);
    const r = await request(app).get('/api/admin/notifications/messages?status=READ').set(auth(adminToken));
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.fields)).toEqual(['status']);
  });

  it('القوالب: تعديل قالب النظام بمتغيّراته فقط، يسري على الرسائل، والحذف يعيد الافتراضي — مع تدقيق', async () => {
    const list = await request(app).get('/api/admin/notifications/templates').set(auth(adminToken));
    expect(list.status).toBe(200);
    const keys = list.body.items.map((t: { key: string; channel: string }) => `${t.key}:${t.channel}`);
    expect(keys).toEqual(expect.arrayContaining(['otp:WHATSAPP', 'parent_exam_result:WHATSAPP', 'live_reminder:IN_APP', 'live_reminder:WHATSAPP', 'enrollment_expiry:IN_APP', 'enrollment_expiry:WHATSAPP']));

    const url = '/api/admin/notifications/templates/parent_exam_result/WHATSAPP';
    const valid = { title: 'نتيجة', body: 'نتيجة {name}: {score} من {total} — {exam}' };
    for (const [body, field] of [
      [{ ...valid, body: 'نتيجة {name}: {total} — {exam}' }, 'body'], // {score} إلزامي
      [{ ...valid, body: `${valid.body} {phone}` }, 'body'], // متغيّر غير مسموح
      [{ ...valid, title: 'نتيجة {code}' }, 'title'],
      [{ ...valid, body: 'x'.repeat(1001) }, 'body'],
      [{ ...valid, key: 'otp' }, ''], // حقل زائد
    ] as const) {
      const r = await request(app).put(url).set(auth(adminToken)).send(body);
      expect(r.status, JSON.stringify(body).slice(0, 80)).toBe(400);
      expect(Object.keys(r.body.fields)).toEqual([field]);
    }
    // مسار: مفتاح غير صالح، قناة غير مدعومة، قناة لا يدعمها المفتاح
    expect(Object.keys((await request(app).put('/api/admin/notifications/templates/Bad-Key/WHATSAPP').set(auth(adminToken)).send(valid)).body.fields)).toEqual(['key']);
    expect(Object.keys((await request(app).put('/api/admin/notifications/templates/otp/SMS').set(auth(adminToken)).send(valid)).body.fields)).toEqual(['channel']);
    expect(Object.keys((await request(app).put('/api/admin/notifications/templates/parent_exam_result/IN_APP').set(auth(adminToken)).send(valid)).body.fields)).toEqual(['channel']);

    const saved = await request(app).put(url).set(auth(adminToken)).send(valid);
    expect(saved.status).toBe(200);
    expect(saved.body.template).toMatchObject({ key: 'parent_exam_result', channel: 'WHATSAPP', body: valid.body, isSystem: true, isCustomized: true });
    const { loadTemplate } = await import('../src/modules/notifications/templates.js');
    expect((await loadTemplate('parent_exam_result')).WHATSAPP!.body).toBe(valid.body);

    const reset = await request(app).delete(url).set(auth(adminToken));
    expect(reset.status).toBe(200);
    expect((await loadTemplate('parent_exam_result')).WHATSAPP!.body).toContain('ابنك/بنتك {name}');
    expect((await request(app).delete(url).set(auth(adminToken))).status).toBe(404);
    const actions = await prisma.auditLog.findMany({ where: { actorId: adminId, entity: 'NotificationTemplate' }, orderBy: { id: 'asc' }, select: { action: true } });
    expect(actions.map((a) => a.action)).toEqual(['NOTIF_TEMPLATE_UPDATE', 'NOTIF_TEMPLATE_DELETE']);
  });

  it('القوالب المخصّصة: إنشاء/تكرار 409/مفتاح محجوز/تعديل/حذف', async () => {
    const base = { key: CUSTOM_KEY, channel: 'IN_APP', title: 'أهلاً {name}', body: 'مرحباً بك في منصة مس آن' };
    const created = await request(app).post('/api/admin/notifications/templates').set(auth(adminToken)).send(base);
    expect(created.status).toBe(201);
    expect(created.body.template).toMatchObject({ key: CUSTOM_KEY, isSystem: false, vars: ['name'] });
    expect((await request(app).post('/api/admin/notifications/templates').set(auth(adminToken)).send(base)).status).toBe(409);
    const reserved = await request(app).post('/api/admin/notifications/templates').set(auth(adminToken)).send({ ...base, key: 'live_reminder' });
    expect(Object.keys(reserved.body.fields)).toEqual(['key']);
    const url = `/api/admin/notifications/templates/${CUSTOM_KEY}/IN_APP`;
    expect((await request(app).put(url).set(auth(adminToken)).send({ title: '', body: 'نص {score}' })).status).toBe(400);
    expect((await request(app).put(url).set(auth(adminToken)).send({ title: '', body: 'نص جديد' })).body.template.body).toBe('نص جديد');
    expect((await request(app).put(`/api/admin/notifications/templates/${CUSTOM_KEY}/WHATSAPP`).set(auth(adminToken)).send({ title: '', body: 'x' })).status).toBe(404);
    expect((await request(app).delete(url).set(auth(adminToken))).status).toBe(200);
    expect((await request(app).delete(url).set(auth(adminToken))).status).toBe(404);
  });
});

// اختبارات تكامل على قاعدة البيانات الحقيقية (DATABASE_URL من .env):
// الشحن بالكود، السباق على نفس الكود، الاشتراك بالمحفظة وتمديده، webhook Paymob.
// كل البيانات بأرقام 0155599xxxx وتُحذف في النهاية.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import type supertestType from 'supertest';

const HMAC_SECRET = 'test-paymob-hmac-secret';
const PHONE_PREFIX = '0155599';
const DAY = 24 * 60 * 60 * 1000;

let app: Express;
let prisma: PrismaClient;
let request: typeof supertestType;
let sign: (p: { sub: number; role: 'STUDENT' | 'ADMIN'; name: string }) => string;
let computeHmac: (obj: unknown, secret: string) => string;

const startedAt = new Date();
const students: { id: number; token: string }[] = [];
let adminToken = '';
let adminId = 0;
let monthly = { id: 0, lessonId: 0 };
let foundation = 0;
let batchIds: number[] = [];

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const balanceOf = async (userId: number) =>
  (await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance;

async function cleanup() {
  const users = await prisma.user.findMany({ where: { phone: { startsWith: PHONE_PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.codeBatch.deleteMany({ where: { OR: [{ createdBy: { in: ids } }, { label: { startsWith: 'TEST-batch' } }] } });
  await prisma.course.deleteMany({ where: { title: { startsWith: 'TEST-P4' } } });
  const payments = await prisma.payment.findMany({ where: { userId: { in: ids } }, select: { id: true } });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorId: { in: ids } },
        // سجلات الـ webhook (بلا منفّذ) عن دفعات الاختبار فقط — لا تمس سجلات حقيقية
        // مثل PAYMENT_EXPIRED التي يكتبها كنّاس خادم التطوير أثناء الاختبار
        ...payments.map((p) => ({ actorId: null, meta: { path: ['paymentId'], equals: p.id } })),
        { actorId: null, meta: { path: ['orderId'], string_starts_with: 'test-ord-' } },
      ],
    },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(async () => {
  process.env.PAYMOB_HMAC_SECRET = HMAC_SECRET; // dotenv لا يستبدل القيمة المحددة مسبقاً
  await import('dotenv/config');
  ({ prisma } = await import('../src/lib/prisma.js'));
  const { createApp } = await import('../src/app.js');
  ({ signAccessToken: sign } = await import('../src/lib/tokens.js'));
  ({ computeTransactionHmac: computeHmac } = await import('../src/lib/paymob.js'));
  request = (await import('supertest')).default;
  app = createApp();

  await cleanup();

  for (let i = 1; i <= 6; i++) {
    const u = await prisma.user.create({
      data: {
        name: `طالب اختبار ${i}`,
        phone: `${PHONE_PREFIX}${String(i).padStart(4, '0')}`,
        parentPhone: '01000000001',
        passwordHash: 'x',
        isActive: true,
        wallet: { create: {} },
      },
    });
    students.push({ id: u.id, token: sign({ sub: u.id, role: 'STUDENT', name: u.name }) });
  }
  const admin = await prisma.user.create({
    data: { name: 'أدمن اختبار', phone: `${PHONE_PREFIX}0099`, parentPhone: '01000000001', passwordHash: 'x', isActive: true, role: 'ADMIN' },
  });
  adminId = admin.id;
  adminToken = sign({ sub: admin.id, role: 'ADMIN', name: admin.name });

  const m = await prisma.course.create({
    data: {
      title: 'TEST-P4 شهري',
      description: 'اختبار',
      grade: 'FOURTH_PRIMARY',
      type: 'MONTHLY',
      price: 5000,
      isPublished: true,
      lessons: { create: { title: 'حصة', videoProvider: 'YOUTUBE', youtubeVideoId: 'M7lc1UVf-VE', durationSec: 600 } },
    },
    include: { lessons: true },
  });
  monthly = { id: m.id, lessonId: m.lessons[0]!.id };
  foundation = (
    await prisma.course.create({
      data: { title: 'TEST-P4 تأسيس', description: 'اختبار', grade: 'FOURTH_PRIMARY', type: 'FOUNDATION', price: 3000, isPublished: true },
    })
  ).id;
}, 30_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

// ── الأكواد ──────────────────────────────────────────────────────
describe('redeem codes', () => {
  let codes: string[] = [];

  it('الأدمن يولّد دفعة؛ تُخزَّن مجزّأة ويُرجع النص الخام مرة واحدة', async () => {
    const res = await request(app)
      .post('/api/admin/codes/batch')
      .set(auth(adminToken))
      .send({ label: 'TEST-batch', value: 10000, count: 4 });
    expect(res.status).toBe(201);
    codes = res.body.codes;
    batchIds.push(res.body.batch.id);
    expect(codes).toHaveLength(4);
    expect(codes[0]).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(res.body.batch.stats).toEqual({ ACTIVE: 4, USED: 0, DISABLED: 0 });

    const stored = await prisma.redeemCode.findMany({ where: { batchId: res.body.batch.id } });
    const raw = codes.map((c) => c.replace(/-/g, ''));
    for (const s of stored) {
      expect(raw).not.toContain(s.codeHash);
      expect(s.codeHash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(stored.map((s) => s.codeHint).sort()).toEqual(raw.map((c) => c.slice(-4)).sort());
    // السجل بلا أكواد
    const log = await prisma.auditLog.findFirst({ where: { action: 'CODE_BATCH_CREATE', actorId: adminId } });
    expect(JSON.stringify(log?.meta)).not.toContain(raw[0]);
  });

  it('الطالب لا يصل لمسارات الأكواد (403)', async () => {
    const res = await request(app).get('/api/admin/codes').set(auth(students[0]!.token));
    expect(res.status).toBe(403);
  });

  it('شحن ناجح: الكود USED + الرصيد + حركة balanceAfter + AuditLog', async () => {
    const s = students[0]!;
    // الطالب قد يكتبه بأحرف صغيرة ومسافات
    const res = await request(app).post('/api/wallet/redeem').set(auth(s.token)).send({ code: ` ${codes[0]!.toLowerCase()} ` });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ amount: 10000, balance: 10000 });

    const wallet = await request(app).get('/api/wallet').set(auth(s.token));
    expect(wallet.body.balance).toBe(10000);
    expect(wallet.body.transactions[0]).toMatchObject({ amount: 10000, type: 'TOPUP', balanceAfter: 10000 });
    const log = await prisma.auditLog.findFirst({ where: { action: 'WALLET_REDEEM', actorId: s.id } });
    expect(log).not.toBeNull();
  });

  it('كود مستخدم → 409 ولا يتغيّر الرصيد', async () => {
    const res = await request(app).post('/api/wallet/redeem').set(auth(students[1]!.token)).send({ code: codes[0] });
    expect(res.status).toBe(409);
    expect(await balanceOf(students[1]!.id)).toBe(0);
  });

  it('كود معطّل → 400؛ تعطيل كود مستخدم → 409', async () => {
    const list = await request(app).get(`/api/admin/codes?batchId=${batchIds[0]}&status=ACTIVE`).set(auth(adminToken));
    const target = list.body.items.find((c: { codeHint: string }) => codes[1]!.endsWith(c.codeHint));
    const dis = await request(app).patch(`/api/admin/codes/${target.id}/disable`).set(auth(adminToken));
    expect(dis.status).toBe(200);
    const res = await request(app).post('/api/wallet/redeem').set(auth(students[1]!.token)).send({ code: codes[1] });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('معطّل');

    const used = await prisma.redeemCode.findFirstOrThrow({ where: { batchId: batchIds[0], status: 'USED' } });
    expect((await request(app).patch(`/api/admin/codes/${used.id}/disable`).set(auth(adminToken))).status).toBe(409);
  });

  it('كود غير معروف → 400؛ صيغة خاطئة → 400 (تحقق)', async () => {
    const unknown = await request(app).post('/api/wallet/redeem').set(auth(students[2]!.token)).send({ code: 'AAAA-BBBB-CCCC-DDDD' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.message).toBe('الكود غير صحيح');
    const bad = await request(app).post('/api/wallet/redeem').set(auth(students[2]!.token)).send({ code: 'short' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION');
    const failed = await prisma.auditLog.findMany({ where: { action: 'WALLET_REDEEM_FAILED', actorId: students[2]!.id } });
    expect(failed).toHaveLength(1);
    // لا يُخزَّن أي جزء من الكود المُدخل
    expect(JSON.stringify(failed[0]!.meta)).not.toMatch(/DDDD|AAAA/);
  });

  it('سباق متوازٍ على نفس الكود من 5 طلاب → نجاح واحد بالضبط', async () => {
    const racers = students.slice(1, 6);
    const results = await Promise.all(
      racers.map((s) => request(app).post('/api/wallet/redeem').set(auth(s.token)).send({ code: codes[2] })),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409, 409, 409, 409]);

    const balances = await Promise.all(racers.map((s) => balanceOf(s.id)));
    expect(balances.reduce((a, b) => a + b, 0)).toBe(10000);
    const txCount = await prisma.walletTransaction.count({ where: { refId: { startsWith: 'code:' }, wallet: { userId: { in: racers.map((s) => s.id) } } } });
    expect(txCount).toBe(1);
  });

  it('نفس الطالب يرسل نفس الكود 3 مرات بالتوازي → يُضاف مرة واحدة', async () => {
    const s = students[0]!;
    const before = await balanceOf(s.id);
    const results = await Promise.all(
      [1, 2, 3].map(() => request(app).post('/api/wallet/redeem').set(auth(s.token)).send({ code: codes[3] })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await balanceOf(s.id)).toBe(before + 10000);
  });
});

// ── الاشتراك بالمحفظة ────────────────────────────────────────────
describe('subscribe with wallet', () => {
  it('رصيد غير كافٍ → 400 INSUFFICIENT_BALANCE ولا اشتراك ولا خصم', async () => {
    const s = students[5]!;
    await prisma.wallet.update({ where: { userId: s.id }, data: { balance: 4999 } });
    const res = await request(app).post(`/api/courses/${monthly.id}/subscribe`).set(auth(s.token));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
    expect(await balanceOf(s.id)).toBe(4999);
    expect(await prisma.enrollment.count({ where: { userId: s.id } })).toBe(0);
    expect((await request(app).get(`/api/lessons/${monthly.lessonId}/play`).set(auth(s.token))).status).toBe(403);
  });

  it('اشتراك ناجح يخصم ويفتح الحصص (/play → 200)، ثم التجديد يمدّد 30 يوماً', async () => {
    const s = students[0]!; // رصيده 20000
    const first = await request(app).post(`/api/courses/${monthly.id}/subscribe`).set(auth(s.token));
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ courseId: monthly.id, charged: 5000, balance: 15000 });
    const exp1 = Date.parse(first.body.expiresAt);
    expect(Math.abs(exp1 - (Date.now() + 30 * DAY))).toBeLessThan(60_000);

    const play = await request(app).get(`/api/lessons/${monthly.lessonId}/play`).set(auth(s.token));
    expect(play.status).toBe(200);
    expect(play.body.provider).toBe('YOUTUBE');

    const second = await request(app).post(`/api/courses/${monthly.id}/subscribe`).set(auth(s.token));
    expect(second.status).toBe(201);
    expect(Date.parse(second.body.expiresAt) - exp1).toBe(30 * DAY);
    expect(second.body.balance).toBe(10000);

    const tx = await prisma.walletTransaction.findFirst({
      where: { wallet: { userId: s.id }, type: 'PURCHASE' },
      orderBy: { id: 'desc' },
    });
    expect(tx).toMatchObject({ amount: -5000, balanceAfter: 10000 });
    expect(await prisma.auditLog.count({ where: { actorId: s.id, action: { in: ['SUBSCRIPTION_CREATE', 'SUBSCRIPTION_RENEW'] } } })).toBe(2);
  });

  it('اشتراكات متوازية برصيد يكفي مرة واحدة → نجاح واحد والرصيد لا يصبح سالباً', async () => {
    const s = students[4]!;
    await prisma.wallet.update({ where: { userId: s.id }, data: { balance: 3000 } });
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => request(app).post(`/api/courses/${foundation}/subscribe`).set(auth(s.token))),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await balanceOf(s.id)).toBe(0);
  });

  it('كورس لمرة واحدة ساري → 409 بدون خصم', async () => {
    const s = students[0]!;
    const once = await request(app).post(`/api/courses/${foundation}/subscribe`).set(auth(s.token));
    expect(once.status).toBe(201);
    const before = await balanceOf(s.id);
    const again = await request(app).post(`/api/courses/${foundation}/subscribe`).set(auth(s.token));
    expect(again.status).toBe(409);
    expect(await balanceOf(s.id)).toBe(before);
  });

  it('قاعدة البيانات نفسها ترفض الرصيد السالب', async () => {
    await expect(
      prisma.wallet.update({ where: { userId: students[4]!.id }, data: { balance: { decrement: 1 } } }),
    ).rejects.toThrow(/Wallet_balance_non_negative|check constraint/i);
  });
});

// ── Paymob webhook ───────────────────────────────────────────────
describe('paymob webhook', () => {
  const txn = (orderId: string, id: number, amount: number, extra: Record<string, unknown> = {}) => ({
    id,
    pending: false,
    amount_cents: amount,
    success: true,
    is_auth: false,
    is_capture: false,
    is_standalone_payment: true,
    is_voided: false,
    is_refunded: false,
    is_3d_secure: true,
    integration_id: 4000001,
    has_parent_transaction: false,
    created_at: '2026-09-29T01:05:12.000000',
    currency: 'EGP',
    error_occured: false,
    owner: 1,
    order: { id: orderId },
    source_data: { pan: '2346', type: 'card', sub_type: 'MasterCard' },
    ...extra,
  });
  const send = (obj: object, hmac: string) =>
    request(app).post(`/api/payments/paymob/webhook?hmac=${hmac}`).send({ type: 'TRANSACTION', obj });

  it('بدء الدفع بدون مفاتيح Paymob → 503 برسالة واضحة', async () => {
    const res = await request(app).post('/api/payments/paymob/init').set(auth(students[1]!.token)).send({ topupAmount: 10000 });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PAYMENT_UNCONFIGURED');
  });

  it('webhook مزوّر → 401 والدفعة تبقى PENDING بلا شحن', async () => {
    const s = students[1]!;
    const p = await prisma.payment.create({ data: { userId: s.id, amount: 20000, purpose: 'TOPUP', providerRef: `test-ord-${s.id}-1` } });
    const before = await balanceOf(s.id);
    const obj = txn(p.providerRef!, 900000 + p.id, 20000);
    const forgedHmac = computeHmac({ ...obj, amount_cents: 1 }, HMAC_SECRET);
    expect((await send(obj, forgedHmac)).status).toBe(401);
    expect((await send(obj, computeHmac(obj, 'attacker-secret'))).status).toBe(401);
    expect((await request(app).post('/api/payments/paymob/webhook').send({ type: 'TRANSACTION', obj })).status).toBe(401);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('PENDING');
    expect(await balanceOf(s.id)).toBe(before);
    expect(await prisma.auditLog.count({ where: { action: 'PAYMOB_WEBHOOK_FORGED', createdAt: { gte: startedAt } } })).toBeGreaterThanOrEqual(3);
  });

  it('webhook صحيح يشحن مرة واحدة حتى مع التكرار والتوازي', async () => {
    const s = students[1]!;
    const p = await prisma.payment.findFirstOrThrow({ where: { providerRef: `test-ord-${s.id}-1` } });
    const before = await balanceOf(s.id);
    const obj = txn(p.providerRef!, 900000 + p.id, 20000);
    const hmac = computeHmac(obj, HMAC_SECRET);

    const results = await Promise.all([1, 2, 3].map(() => send(obj, hmac)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.map((r) => r.body.outcome).sort()).toEqual(['duplicate', 'duplicate', 'paid']);
    const replay = await send(obj, hmac);
    expect(replay.body.outcome).toBe('duplicate');

    expect(await balanceOf(s.id)).toBe(before + 20000);
    const paid = await prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(paid.status).toBe('PAID');
    expect(paid.paidAt).not.toBeNull();
    // الطالب يرى حالة دفعته فقط
    expect((await request(app).get(`/api/payments/${p.id}`).set(auth(s.token))).body.payment.status).toBe('PAID');
    expect((await request(app).get(`/api/payments/${p.id}`).set(auth(students[2]!.token))).status).toBe(404);
  });

  it('مبلغ مختلف عن الدفعة → FAILED بلا شحن', async () => {
    const s = students[2]!;
    const p = await prisma.payment.create({ data: { userId: s.id, amount: 20000, purpose: 'TOPUP', providerRef: `test-ord-${s.id}-2` } });
    const before = await balanceOf(s.id);
    const obj = txn(p.providerRef!, 900000 + p.id, 100);
    const res = await send(obj, computeHmac(obj, HMAC_SECRET));
    expect(res.body.outcome).toBe('failed');
    expect(await balanceOf(s.id)).toBe(before);
  });

  it('دفع كورس عبر webhook ← اشتراك ONLINE وتفتح الحصص', async () => {
    const s = students[3]!;
    const p = await prisma.payment.create({
      data: { userId: s.id, amount: 5000, purpose: 'COURSE', courseId: monthly.id, providerRef: `test-ord-${s.id}-3` },
    });
    expect((await request(app).get(`/api/lessons/${monthly.lessonId}/play`).set(auth(s.token))).status).toBe(403);
    const obj = txn(p.providerRef!, 900000 + p.id, 5000);
    expect((await send(obj, computeHmac(obj, HMAC_SECRET))).body.outcome).toBe('paid');
    const enr = await prisma.enrollment.findUniqueOrThrow({ where: { userId_courseId: { userId: s.id, courseId: monthly.id } } });
    expect(enr.source).toBe('ONLINE');
    expect((await request(app).get(`/api/lessons/${monthly.lessonId}/play`).set(auth(s.token))).status).toBe(200);
  });

  it('دفع ثانٍ لكورس لمرة واحدة مملوك بالفعل ← يُضاف للمحفظة بلا تمديد', async () => {
    const s = students[3]!;
    await request(app).post('/api/admin/enrollments').set(auth(adminToken)).send({ phone: `${PHONE_PREFIX}0004`, courseId: foundation });
    const enrBefore = await prisma.enrollment.findUniqueOrThrow({ where: { userId_courseId: { userId: s.id, courseId: foundation } } });
    const before = await balanceOf(s.id);
    const p = await prisma.payment.create({
      data: { userId: s.id, amount: 3000, purpose: 'COURSE', courseId: foundation, providerRef: `test-ord-${s.id}-4` },
    });
    const obj = txn(p.providerRef!, 900000 + p.id, 3000);
    expect((await send(obj, computeHmac(obj, HMAC_SECRET))).body.outcome).toBe('paid');
    expect(await balanceOf(s.id)).toBe(before + 3000);
    const enrAfter = await prisma.enrollment.findUniqueOrThrow({ where: { userId_courseId: { userId: s.id, courseId: foundation } } });
    expect(enrAfter.expiresAt.getTime()).toBe(enrBefore.expiresAt.getTime());
  });

  it('معاملة ناجحة ثانية أو استرداد على دفعة مدفوعة ← لا شحن، لكن تُسجَّل للتسوية', async () => {
    const s = students[1]!;
    const p = await prisma.payment.findFirstOrThrow({ where: { providerRef: `test-ord-${s.id}-1` } });
    const before = await balanceOf(s.id);
    const extra = txn(p.providerRef!, 800000 + p.id, 20000);
    expect((await send(extra, computeHmac(extra, HMAC_SECRET))).body.outcome).toBe('duplicate');
    const refund = txn(p.providerRef!, 900000 + p.id, 20000, { is_refunded: true });
    expect((await send(refund, computeHmac(refund, HMAC_SECRET))).body.outcome).toBe('duplicate');
    expect(await balanceOf(s.id)).toBe(before);
    const actions = await prisma.auditLog.findMany({
      where: { action: { in: ['PAYMOB_EXTRA_TXN', 'PAYMOB_REFUND_NOTIFIED'] }, createdAt: { gte: startedAt } },
      select: { action: true },
    });
    expect(actions.map((a) => a.action).sort()).toEqual(['PAYMOB_EXTRA_TXN', 'PAYMOB_REFUND_NOTIFIED']);
  });
});

// ── عمليات الأدمن اليدوية ────────────────────────────────────────
describe('admin manual operations', () => {
  it('شحن واشتراك يدوي بالموبايل + AuditLog، والطالب ممنوع (403)', async () => {
    const s = students[2]!;
    const phone = `${PHONE_PREFIX}0003`;
    const before = await balanceOf(s.id);
    const top = await request(app).post('/api/admin/wallet/topup').set(auth(adminToken)).send({ phone, amount: 2500, note: 'تعويض اختبار' });
    expect(top.status).toBe(200);
    expect(top.body.balance).toBe(before + 2500);

    const enr = await request(app).post('/api/admin/enrollments').set(auth(adminToken)).send({ phone, courseId: monthly.id });
    expect(enr.status).toBe(201);
    expect(enr.body.source).toBe('ADMIN');
    expect(await prisma.auditLog.count({ where: { actorId: adminId, action: { in: ['ADMIN_WALLET_TOPUP', 'ADMIN_ENROLL'] } } })).toBe(3); // + اشتراك يدوي في اختبار الدفع المزدوج

    expect((await request(app).post('/api/admin/wallet/topup').set(auth(s.token)).send({ phone, amount: 2500, note: 'hack' })).status).toBe(403);
    expect((await request(app).get('/api/admin/payments').set(auth(adminToken))).status).toBe(200);
  });
});

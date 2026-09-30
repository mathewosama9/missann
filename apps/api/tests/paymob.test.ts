import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x';
  process.env.JWT_ACCESS_SECRET ??= 'test_access_secret_key_123456';
  process.env.JWT_REFRESH_SECRET ??= 'test_refresh_secret_key_123456';
});

const SECRET = 'dummy-paymob-hmac-secret';

// شكل إشعار معاملة Paymob (Transaction processed callback)
const txn = () => ({
  id: 192036465,
  pending: false,
  amount_cents: 15000,
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
  owner: 302852,
  order: { id: 217503754 },
  source_data: { pan: '2346', type: 'card', sub_type: 'MasterCard' },
});

describe('paymob hmac', () => {
  it('يحسب HMAC-SHA512 على الحقول بالترتيب الرسمي', async () => {
    const { computeTransactionHmac } = await import('../src/lib/paymob.js');
    const o = txn();
    const concatenated =
      '15000' + '2026-09-29T01:05:12.000000' + 'EGP' + 'false' + 'false' + '192036465' + '4000001' +
      'true' + 'false' + 'false' + 'false' + 'true' + 'false' + '217503754' + '302852' + 'false' +
      '2346' + 'MasterCard' + 'card' + 'true';
    const expected = crypto.createHmac('sha512', SECRET).update(concatenated).digest('hex');
    expect(computeTransactionHmac(o, SECRET)).toBe(expected);
  });

  it('يقبل التوقيع الصحيح (حتى بأحرف كبيرة)', async () => {
    const { computeTransactionHmac, verifyTransactionHmac } = await import('../src/lib/paymob.js');
    const o = txn();
    const hmac = computeTransactionHmac(o, SECRET);
    expect(verifyTransactionHmac(o, hmac, SECRET)).toBe(true);
    expect(verifyTransactionHmac(o, hmac.toUpperCase(), SECRET)).toBe(true);
  });

  it('يرفض الإشعار المزوّر أو المعدّل', async () => {
    const { computeTransactionHmac, verifyTransactionHmac } = await import('../src/lib/paymob.js');
    const o = txn();
    const hmac = computeTransactionHmac(o, SECRET);

    // تعديل المبلغ أو النجاح أو رقم الطلب بعد التوقيع
    expect(verifyTransactionHmac({ ...o, amount_cents: 1500000 }, hmac, SECRET)).toBe(false);
    expect(verifyTransactionHmac({ ...o, success: false }, hmac, SECRET)).toBe(false);
    expect(verifyTransactionHmac({ ...o, order: { id: 1 } }, hmac, SECRET)).toBe(false);
    // مفتاح آخر / توقيع مفقود / صيغة خاطئة / بدون سر
    expect(verifyTransactionHmac(o, computeTransactionHmac(o, 'other-secret'), SECRET)).toBe(false);
    expect(verifyTransactionHmac(o, undefined, SECRET)).toBe(false);
    expect(verifyTransactionHmac(o, 'abc', SECRET)).toBe(false);
    expect(verifyTransactionHmac(o, ['x'], SECRET)).toBe(false);
    expect(verifyTransactionHmac(o, hmac, '')).toBe(false);
  });
});

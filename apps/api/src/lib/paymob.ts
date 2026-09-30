import crypto from 'node:crypto';
import { env } from './env.js';
import { AppError } from './http.js';

// تكامل Paymob (Accept): إنشاء طلب + مفتاح دفع ← رابط iframe، والتحقق من توقيع HMAC للـ webhook.
// كل المفاتيح من env فقط؛ المبالغ بالقرش = amount_cents عند Paymob (الجنيه = 100 قرش).

const API = 'https://accept.paymob.com/api';

export const isPaymobConfigured = (): boolean =>
  Boolean(env.PAYMOB_API_KEY && env.PAYMOB_INTEGRATION_ID && env.PAYMOB_IFRAME_ID && env.PAYMOB_HMAC_SECRET);

export function assertPaymobConfigured(): void {
  if (!isPaymobConfigured()) {
    throw new AppError(
      503,
      'الدفع الأونلاين غير متاح حالياً — اشحن محفظتك بكارت شحن أو تواصل معنا',
      'PAYMENT_UNCONFIGURED',
    );
  }
}

export interface PaymobBilling {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

export interface PaymobCheckout {
  orderId: string;
  iframeUrl: string;
}

// الخطوات: auth token ← order ← payment key ← iframe
export async function createPaymobCheckout(input: {
  amountCents: number;
  merchantOrderId: string;
  billing: PaymobBilling;
}): Promise<PaymobCheckout> {
  assertPaymobConfigured();
  const { token } = await paymobPost<{ token: string }>('/auth/tokens', { api_key: env.PAYMOB_API_KEY });

  const order = await paymobPost<{ id: number }>('/ecommerce/orders', {
    auth_token: token,
    delivery_needed: false,
    amount_cents: input.amountCents,
    currency: 'EGP',
    merchant_order_id: input.merchantOrderId,
    items: [],
  });

  const key = await paymobPost<{ token: string }>('/acceptance/payment_keys', {
    auth_token: token,
    amount_cents: input.amountCents,
    expiration: 60 * 60,
    order_id: order.id,
    currency: 'EGP',
    integration_id: Number(env.PAYMOB_INTEGRATION_ID),
    billing_data: {
      first_name: input.billing.firstName,
      last_name: input.billing.lastName,
      phone_number: input.billing.phone,
      email: input.billing.email,
      apartment: 'NA',
      floor: 'NA',
      street: 'NA',
      building: 'NA',
      shipping_method: 'NA',
      postal_code: 'NA',
      city: 'NA',
      state: 'NA',
      country: 'EG',
    },
  });

  return {
    orderId: String(order.id),
    iframeUrl: `${API}/acceptance/iframes/${env.PAYMOB_IFRAME_ID}?payment_token=${encodeURIComponent(key.token)}`,
  };
}

// ── HMAC لإشعار المعاملة (Transaction processed callback) ────────
// SHA512 على قيم هذه الحقول بالترتيب (القيم المنطقية "true"/"false"، الغائبة = نص فارغ)
export const PAYMOB_HMAC_FIELDS = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
] as const;

const pick = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);

export function computeTransactionHmac(obj: unknown, secret: string): string {
  const payload = PAYMOB_HMAC_FIELDS.map((f) => {
    const v = pick(obj, f);
    return v === null || v === undefined ? '' : String(v);
  }).join('');
  return crypto.createHmac('sha512', secret).update(payload).digest('hex');
}

export function verifyTransactionHmac(obj: unknown, hmac: unknown, secret: string): boolean {
  if (!secret || typeof hmac !== 'string' || !/^[0-9a-f]{128}$/i.test(hmac)) return false;
  const expected = Buffer.from(computeTransactionHmac(obj, secret), 'hex');
  const given = Buffer.from(hmac.toLowerCase(), 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// ── أدوات داخلية ────────────────────────────────────────────────
async function paymobPost<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError(502, 'تعذّر الاتصال ببوابة الدفع، حاول بعد قليل', 'PAYMOB_UNREACHABLE');
  }
  if (!res.ok) throw new AppError(502, `خطأ من بوابة الدفع (${res.status})`, 'PAYMOB_ERROR');
  return (await res.json()) as T;
}

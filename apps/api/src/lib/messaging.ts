import { env } from './env.js';
import { logger, maskPhone } from './logger.js';

// ── واجهة مزوّدي الرسائل الصادرة (واتساب / SMS / سجل التطوير) ────────

export interface MessageProvider {
  readonly name: string;
  readonly channel: 'WHATSAPP' | 'SMS';
  // يرجع معرّف الرسالة لدى المزوّد، أو يرمي ProviderError. sensitive: النص فيه سر (كود تحقق)
  send(to: string, text: string, opts: { sensitive: boolean }): Promise<string>;
}

// retryable=false: خطأ دائم (رقم غير صالح، مفتاح مرفوض) — لا فائدة من إعادة المحاولة
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export const PROVIDER_TIMEOUT_MS = 10_000;

// 01012345678 ← 201012345678 (الصيغة الدولية بلا +)
export const toIntl = (phone: string) => `20${phone.slice(1)}`;

// نص خطأ آمن للتخزين والسجل: بلا مفاتيح المزوّد، وبلا أرقام هواتف كاملة، وبطول محدود
export function safeError(text: string): string {
  let out = text;
  for (const secret of [env.WHATSAPP_TOKEN, env.SMS_API_KEY]) if (secret) out = out.split(secret).join('[محجوب]');
  return out.replace(/\d{7,}/g, (d) => maskPhone(d)).slice(0, 200);
}

// رسالة الخطأ من رد المزوّد (Meta: error.message، البوابات: message/error)
function providerDetail(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as { error?: { message?: unknown } | string; message?: unknown };
  const msg = typeof d.error === 'object' ? d.error?.message : (d.error ?? d.message);
  return typeof msg === 'string' ? ` — ${msg}` : '';
}

// POST JSON بمهلة؛ 429 و 5xx وانقطاع الشبكة قابلة لإعادة المحاولة، وباقي 4xx دائمة
export async function postJson(label: string, url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = (err as Error).name === 'TimeoutError';
    throw new ProviderError(`${label}: ${timedOut ? 'انتهت مهلة المزوّد' : 'تعذّر الاتصال بالمزوّد'}`, true);
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ProviderError(safeError(`${label} ${res.status}${providerDetail(data)}`), res.status === 429 || res.status >= 500);
  }
  return data;
}

// التطوير بلا مفاتيح: الرسالة تُسجَّل فقط — الرقم مُقنَّع والنص الحسّاس (كود التحقق) محجوب
export const devLogProvider: MessageProvider = {
  name: 'dev-log',
  channel: 'WHATSAPP',
  async send(to, text, { sensitive }) {
    logger.info({ to: maskPhone(to), text: sensitive ? '[محجوب]' : text }, '📨 رسالة صادرة (مزوّد التطوير — لم تُرسل فعلياً)');
    return 'dev-log';
  },
};

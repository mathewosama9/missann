import { env } from './env.js';
import { postJson, ProviderError, toIntl, type MessageProvider } from './messaging.js';

// بوابة SMS عامة (بديل واتساب): POST JSON {to, from, text} + Bearer ← {id | messageId}.
// null لو غير مضبوطة. لمزوّد بصيغة مختلفة يُعدَّل هذا الملف فقط.
function createSms(): MessageProvider | null {
  if (!env.SMS_PROVIDER_URL || !env.SMS_API_KEY) return null;
  return {
    name: 'sms',
    channel: 'SMS',
    async send(to, text) {
      const data = (await postJson('SMS', env.SMS_PROVIDER_URL, { authorization: `Bearer ${env.SMS_API_KEY}` }, {
        to: toIntl(to),
        from: env.SMS_SENDER,
        text,
      })) as { id?: unknown; messageId?: unknown } | null;
      const id = data?.id ?? data?.messageId;
      if (typeof id !== 'string' && typeof id !== 'number') throw new ProviderError('SMS: رد بلا معرّف رسالة', true);
      return String(id);
    },
  };
}

export const smsProvider = createSms();

import { env } from './env.js';
import { postJson, ProviderError, toIntl, type MessageProvider } from './messaging.js';

// WhatsApp Cloud API (Meta) — رسالة نصية. null لو المفاتيح غير مضبوطة.
// ملاحظة: رسائل المبادرة خارج نافذة 24 ساعة تتطلب قالباً معتمداً من Meta (type: template).
function createWhatsapp(): MessageProvider | null {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID) return null;
  const url = `${env.WHATSAPP_API_URL}/${encodeURIComponent(env.WHATSAPP_PHONE_ID)}/messages`;
  return {
    name: 'whatsapp',
    channel: 'WHATSAPP',
    async send(to, text) {
      const data = (await postJson('WhatsApp', url, { authorization: `Bearer ${env.WHATSAPP_TOKEN}` }, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toIntl(to),
        type: 'text',
        text: { preview_url: false, body: text },
      })) as { messages?: { id?: unknown }[] } | null;
      const id = data?.messages?.[0]?.id;
      if (typeof id !== 'string') throw new ProviderError('WhatsApp: رد بلا معرّف رسالة', true);
      return id;
    },
  };
}

export const whatsappProvider = createWhatsapp();

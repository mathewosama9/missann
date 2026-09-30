import { SYSTEM_TEMPLATES, type SystemTemplateKey, type TemplateChannel } from '@miss-ann/shared';
import { prisma } from '../../lib/prisma.js';

export interface TemplateText {
  title: string;
  body: string;
}
export type TemplateTexts = Partial<Record<TemplateChannel, TemplateText>>;

// نص قالب نظام بكل قنواته: تعديل الأدمن (إن وُجد) يتجاوز النص الافتراضي في الكود.
// استعلام واحد بالفهرس الفريد (key, channel) لكل job — لا كاش حتى يسري التعديل فوراً.
export async function loadTemplate(key: SystemTemplateKey): Promise<TemplateTexts> {
  const out: TemplateTexts = { ...SYSTEM_TEMPLATES[key].defaults };
  const rows = await prisma.notificationTemplate.findMany({ where: { key }, select: { channel: true, title: true, body: true } });
  for (const r of rows) {
    const ch = r.channel as TemplateChannel;
    const base = out[ch];
    if (base) out[ch] = { title: r.title || base.title, body: r.body };
  }
  return out;
}

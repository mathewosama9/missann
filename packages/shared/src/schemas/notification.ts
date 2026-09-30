import { z } from 'zod';
import { BroadcastAudience, Grade, NotifStatus } from '../enums.js';
import {
  CUSTOM_TEMPLATE_VARS,
  isSystemTemplate,
  TEMPLATE_BODY_MAX,
  TEMPLATE_CHANNELS,
  TEMPLATE_KEY_RE,
  TEMPLATE_TITLE_MAX,
  templateSpec,
  templateVarErrors,
} from '../notifications.js';
import { dbId, pageNumber } from './common.js';

// ── صندوق الإشعارات (أي مستخدم مسجّل — ملكه فقط) ─────────────────
export const notificationListSchema = z.object({
  filter: z.enum(['all', 'unread']).default('all'),
  page: pageNumber,
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type NotificationListFilter = z.infer<typeof notificationListSchema>;

// ── الإرسال الجماعي (أدمن) ───────────────────────────────────────
export const broadcastSchema = z
  .object({
    title: z.string().trim().min(2, 'العنوان قصير').max(TEMPLATE_TITLE_MAX),
    body: z.string().trim().min(2, 'النص قصير').max(TEMPLATE_BODY_MAX),
    audience: z.nativeEnum(BroadcastAudience),
    grade: z.nativeEnum(Grade).optional(),
    courseId: dbId.optional(),
    alsoWhatsapp: z.boolean().default(false),
  })
  .strict()
  .superRefine((v, ctx) => {
    // الجمهور يحدد الحقل المطلوب بالضبط — لا صف مع كورس ولا العكس
    if (v.audience === 'GRADE' && !v.grade) ctx.addIssue({ code: 'custom', path: ['grade'], message: 'اختر الصف' });
    if (v.audience === 'COURSE' && !v.courseId) ctx.addIssue({ code: 'custom', path: ['courseId'], message: 'اختر الكورس' });
    if (v.audience !== 'GRADE' && v.grade) ctx.addIssue({ code: 'custom', path: ['grade'], message: 'الصف يُحدَّد فقط عند الإرسال لصف' });
    if (v.audience !== 'COURSE' && v.courseId) ctx.addIssue({ code: 'custom', path: ['courseId'], message: 'الكورس يُحدَّد فقط عند الإرسال لمشتركي كورس' });
    for (const [path, message] of Object.entries(templateVarErrors(CUSTOM_TEMPLATE_VARS, [], v))) {
      ctx.addIssue({ code: 'custom', path: [path], message });
    }
  });
export type BroadcastInput = z.infer<typeof broadcastSchema>;

export const broadcastListSchema = z.object({
  page: pageNumber,
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export type BroadcastListFilter = z.infer<typeof broadcastListSchema>;

// سجل الرسائل الصادرة (واتساب/SMS) — الحالة إلزامية (الفهرس الجزئي status, id)
export const adminMessagesFilterSchema = z.object({
  status: z.nativeEnum(NotifStatus).default('FAILED'),
  page: pageNumber,
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type AdminMessagesFilter = z.infer<typeof adminMessagesFilterSchema>;

// ── القوالب (أدمن) ───────────────────────────────────────────────
const templateKey = z.string().regex(TEMPLATE_KEY_RE, 'المفتاح: حروف إنجليزية صغيرة وأرقام و _ (3–40)');
const templateChannel = z.enum(TEMPLATE_CHANNELS);

export const templateParams = z.object({ key: templateKey, channel: templateChannel });
export type TemplateParams = z.infer<typeof templateParams>;

const contentShape = {
  title: z.string().trim().max(TEMPLATE_TITLE_MAX).default(''),
  body: z.string().trim().min(1, 'النص مطلوب').max(TEMPLATE_BODY_MAX),
};

// المحتوى يُفحص مقابل متغيّرات المفتاح (وقنواته لمفاتيح النظام)
function refineContent(key: string, channel: string, v: { title: string; body: string }, ctx: z.RefinementCtx) {
  const spec = templateSpec(key);
  if (!spec.channels.includes(channel as never)) {
    ctx.addIssue({ code: 'custom', path: ['channel'], message: 'هذا القالب لا يدعم هذه القناة' });
    return;
  }
  for (const [path, message] of Object.entries(templateVarErrors(spec.vars, spec.required, v))) {
    ctx.addIssue({ code: 'custom', path: [path], message });
  }
}

// إنشاء قالب مخصّص (مفاتيح النظام موجودة دائماً وتُعدَّل فقط)
export const templateCreateSchema = z
  .object({ key: templateKey, channel: templateChannel, ...contentShape })
  .strict()
  .superRefine((v, ctx) => {
    if (isSystemTemplate(v.key)) ctx.addIssue({ code: 'custom', path: ['key'], message: 'هذا المفتاح محجوز لقالب نظام' });
    else refineContent(v.key, v.channel, v, ctx);
  });
export type TemplateCreateInput = z.infer<typeof templateCreateSchema>;

// تعديل نص قالب: المفتاح والقناة من المسار (مُتحقَّق منهما مسبقاً بـ templateParams)
export const templateContentSchema = (key: string, channel: string) =>
  z
    .object(contentShape)
    .strict()
    .superRefine((v, ctx) => refineContent(key, channel, v, ctx));
export type TemplateContentInput = z.infer<ReturnType<typeof templateContentSchema>>;

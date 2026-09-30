import { z } from 'zod';
import { LiveProvider } from '../enums.js';
import { isAllowedJoinUrl, LIVE_PROVIDER_HOSTS, normalizeJoinUrl } from '../constants.js';
import { dbId, DB_ID_MAX, pageNumber } from './common.js';

const badUrl = (p: LiveProvider) => `رابط غير مسموح — يجب أن يبدأ بـ https:// ومن ${LIVE_PROVIDER_HOSTS[p].join(' أو ')}`;

const liveBase = z.object({
  courseId: dbId,
  title: z.string().trim().min(3, 'العنوان قصير').max(160),
  provider: z.nativeEnum(LiveProvider),
  // صيغة قياسية قبل الفحص (HTTPS://ZOOM.US ← https://zoom.us) — وإلا يرفضها قيد القاعدة بـ 500
  joinUrl: z.string().trim().max(500).transform(normalizeJoinUrl),
  startAt: z.coerce.date(),
  durationMin: z.number().int().min(10).max(600),
});

// الرابط يُطابَق مع قائمة مضيفي المزوّد المختار (Zoom/Meet) — لا روابط عشوائية
export const liveCreateSchema = liveBase.superRefine((v, ctx) => {
  if (!isAllowedJoinUrl(v.joinUrl, v.provider)) ctx.addIssue({ code: 'custom', path: ['joinUrl'], message: badUrl(v.provider) });
});
export type LiveCreateInput = z.infer<typeof liveCreateSchema>;

// التعديل الجزئي: لو تغيّر الرابط أو المزوّد يُعاد الفحص في الخادم مقابل القيم بعد الدمج
export const liveUpdateSchema = liveBase
  .omit({ courseId: true })
  .partial()
  .superRefine((v, ctx) => {
    if (v.joinUrl !== undefined && v.provider !== undefined && !isAllowedJoinUrl(v.joinUrl, v.provider)) {
      ctx.addIssue({ code: 'custom', path: ['joinUrl'], message: badUrl(v.provider) });
    }
  });
export type LiveUpdateInput = z.infer<typeof liveUpdateSchema>;

export const liveListFilterSchema = z.object({
  page: pageNumber,
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});
export type LiveListFilter = z.infer<typeof liveListFilterSchema>;

export const adminLiveFilterSchema = z.object({
  courseId: z.coerce.number().int().positive().max(DB_ID_MAX).optional(),
  scope: z.enum(['upcoming', 'past']).default('upcoming'),
  page: pageNumber,
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminLiveFilter = z.infer<typeof adminLiveFilterSchema>;

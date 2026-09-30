import { z } from 'zod';
import { dbId, pageNumber } from './common.js';
import { Grade, CourseType, Term, AttachmentType, VideoProvider } from '../enums.js';
import { parseYouTubeId, YOUTUBE_ID_RE } from '../youtube.js';

// رابط http/https فقط (يمنع javascript: وdata: عند عرضه كـ href/src)
const httpUrl = z
  .string()
  .url()
  .refine((v) => /^https?:\/\//i.test(v), 'يجب أن يبدأ الرابط بـ http أو https');

// رابط/معرّف يوتيوب → معرّف من 11 حرفاً
const youtubeIdInput = z.preprocess(
  (v) => (typeof v === 'string' ? (parseYouTubeId(v) ?? v) : v),
  z.string().regex(YOUTUBE_ID_RE, 'رابط يوتيوب غير صحيح'),
);

// قيمة منطقية من query string ("true"/"false") — z.coerce.boolean يحوّل "false" إلى true
const queryBoolean = z.enum(['true', 'false']).transform((v) => v === 'true');

export const courseFilterSchema = z.object({
  grade: z.nativeEnum(Grade).optional(),
  type: z.nativeEnum(CourseType).optional(),
  term: z.nativeEnum(Term).optional(),
  q: z.string().max(80).optional(),
  page: pageNumber,
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
});
export type CourseFilter = z.infer<typeof courseFilterSchema>;

export const courseCreateSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(3).max(4000),
  grade: z.nativeEnum(Grade),
  type: z.nativeEnum(CourseType),
  term: z.nativeEnum(Term).nullable().optional(),
  month: z.number().int().min(1).max(12).nullable().optional(),
  price: z.number().int().min(0), // بالقرش
  coverImage: httpUrl.nullable().optional(),
  isPublished: z.boolean().default(false),
  order: z.number().int().default(0),
});
export type CourseCreateInput = z.infer<typeof courseCreateSchema>;
export const courseUpdateSchema = courseCreateSchema.partial();

export const lessonCreateSchema = z.object({
  title: z.string().min(3).max(160),
  order: z.number().int().default(0),
  videoProvider: z.nativeEnum(VideoProvider).optional(),
  bunnyVideoId: z.string().max(120).nullable().optional(),
  // يقبل رابط يوتيوب بأي صيغة أو المعرّف نفسه، ويُخزَّن المعرّف فقط
  youtubeVideoId: youtubeIdInput.nullable().optional(),
  durationSec: z.number().int().min(0).default(0),
  isFreePreview: z.boolean().default(false),
});
export type LessonCreateInput = z.infer<typeof lessonCreateSchema>;
export const lessonUpdateSchema = lessonCreateSchema.partial();

export const attachmentCreateSchema = z.object({
  type: z.nativeEnum(AttachmentType).default(AttachmentType.PDF),
  url: httpUrl,
  title: z.string().min(1).max(160),
});

export const reorderSchema = z.object({
  items: z
    .array(z.object({ id: dbId, order: z.number().int().min(0).max(100_000) }))
    .min(1)
    .max(500)
    .refine((items) => new Set(items.map((i) => i.id)).size === items.length, 'معرّفات الحصص مكرّرة'),
});

// تقدّم مشاهدة الحصة (يُرسل كل ~15 ثانية) + طلب الإكمال
export const progressSchema = z.object({
  percent: z.number().min(0).max(100),
  lastPositionSec: z.number().int().min(0).max(24 * 60 * 60).default(0),
  completed: z.boolean().optional(),
});
export type ProgressInput = z.infer<typeof progressSchema>;

// إنشاء فيديو في مكتبة Bunny وربطه بحصة
export const bunnyCreateVideoSchema = z.object({
  lessonId: z.number().int().positive(),
  title: z.string().min(1).max(160).optional(),
});
export type BunnyCreateVideoInput = z.infer<typeof bunnyCreateVideoSchema>;

export const coursePublishSchema = z.object({
  isPublished: z.boolean(),
});
export type CoursePublishInput = z.infer<typeof coursePublishSchema>;

// فلترة كتالوج الأدمن (تشمل غير المنشور)
export const adminCourseFilterSchema = z.object({
  grade: z.nativeEnum(Grade).optional(),
  type: z.nativeEnum(CourseType).optional(),
  term: z.nativeEnum(Term).optional(),
  isPublished: queryBoolean.optional(),
  q: z.string().max(80).optional(),
  page: pageNumber,
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminCourseFilter = z.infer<typeof adminCourseFilterSchema>;

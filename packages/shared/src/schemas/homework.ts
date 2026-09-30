import { z } from 'zod';
import { dbId, DB_ID_MAX } from './common.js';
import { HOMEWORK_MAX_GRADE_DEFAULT } from '../constants.js';

// ── أدمن: إنشاء/تعديل واجب (المرفق يُرفع منفصلاً كملف multipart) ─────
export const homeworkCreateSchema = z.object({
  courseId: dbId,
  lessonId: dbId.nullable().optional(),
  title: z.string().trim().min(3, 'العنوان قصير').max(160),
  description: z.string().trim().max(2000).default(''),
  dueAt: z.coerce.date().nullable().optional(),
  maxGrade: z.number().int().min(1).max(100).default(HOMEWORK_MAX_GRADE_DEFAULT),
});
export type HomeworkCreateInput = z.infer<typeof homeworkCreateSchema>;

// الكورس لا يتغيّر بعد الإنشاء (التسليمات مرتبطة باشتراكات هذا الكورس)
export const homeworkUpdateSchema = homeworkCreateSchema.omit({ courseId: true }).partial();
export type HomeworkUpdateInput = z.infer<typeof homeworkUpdateSchema>;

// الحد الأعلى النهائي = maxGrade للواجب (يُفحص في الخادم).
// submittedAt = نسخة الحل التي فتحتها المس: لو استبدل الطالب ملفه بعدها يُرفض التصحيح (409)
export const gradeSubmissionSchema = z.object({
  grade: z.number().int('الدرجة رقم صحيح').min(0, 'الدرجة لا تقل عن صفر').max(100),
  feedback: z.string().trim().max(1000).default(''),
  submittedAt: z.coerce.date(),
});
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;

// ── فلاتر القوائم ────────────────────────────────────────────────
export const HomeworkTab = { REQUIRED: 'REQUIRED', SUBMITTED: 'SUBMITTED', GRADED: 'GRADED' } as const;
export type HomeworkTab = (typeof HomeworkTab)[keyof typeof HomeworkTab];

export const homeworkListFilterSchema = z.object({
  tab: z.nativeEnum(HomeworkTab).default('REQUIRED'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});
export type HomeworkListFilter = z.infer<typeof homeworkListFilterSchema>;

export const adminHomeworkFilterSchema = z.object({
  courseId: z.coerce.number().int().positive().max(DB_ID_MAX).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminHomeworkFilter = z.infer<typeof adminHomeworkFilterSchema>;

export const adminSubmissionsFilterSchema = z.object({
  status: z.enum(['PENDING', 'GRADED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type AdminSubmissionsFilter = z.infer<typeof adminSubmissionsFilterSchema>;

export const submissionParams = z.object({
  id: z.coerce.number().int().positive().max(DB_ID_MAX),
  submissionId: z.coerce.number().int().positive().max(DB_ID_MAX),
});

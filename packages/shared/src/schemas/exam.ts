import { z } from 'zod';
import { AttemptStatus, Grade, QuestionType, ResultRelease } from '../enums.js';
import { ANSWER_TEXT_MAX, isManualQuestion } from '../constants.js';
import { dbId } from './common.js';

// صورة السؤال: رابط https خارجي، أو ملف مرفوع عندنا (اسم عشوائي webp)
export const QUESTION_IMAGE_PATH = /^\/api\/uploads\/[a-f0-9]{32}\.webp$/;
const imageUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => QUESTION_IMAGE_PATH.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v), 'رابط الصورة غير صالح');

export const choiceInput = z.object({
  // موجود ← تعديل اختيار قائم؛ غائب ← اختيار جديد
  id: dbId.optional(),
  text: z.string().trim().min(1, 'اكتب نص الاختيار').max(300),
  isCorrect: z.boolean(),
});
export type ChoiceInput = z.infer<typeof choiceInput>;

// MCQ: 2–6 اختيارات وإجابة صحيحة واحدة بالضبط؛ صح/خطأ: اختياران بالضبط
// الكتابية (مقالي/أكمل/مصطلح): بلا اختيارات، وإجابة نموذجية اختيارية للمصحّح
export const questionInput = z
  .object({
    type: z.nativeEnum(QuestionType),
    text: z.string().trim().min(1, 'اكتب نص السؤال').max(1000),
    imageUrl: imageUrl.nullable().optional(),
    points: z.number().int().min(1).max(100).default(1),
    modelAnswer: z.string().trim().max(2000).nullable().optional(),
    choices: z.array(choiceInput).max(6, '6 اختيارات بحد أقصى').default([]),
  })
  .superRefine((q, ctx) => {
    if (isManualQuestion(q.type)) {
      if (q.choices.length > 0) {
        ctx.addIssue({ code: 'custom', path: ['choices'], message: 'السؤال الكتابي بلا اختيارات' });
      }
      return;
    }
    if (q.modelAnswer) {
      ctx.addIssue({ code: 'custom', path: ['modelAnswer'], message: 'الإجابة النموذجية للأسئلة الكتابية فقط' });
    }
    if (q.choices.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['choices'], message: 'اختياران على الأقل' });
    }
    const correct = q.choices.filter((c) => c.isCorrect).length;
    if (correct !== 1) {
      ctx.addIssue({ code: 'custom', path: ['choices'], message: 'حدّد إجابة صحيحة واحدة بالضبط' });
    }
    if (q.type === QuestionType.TRUEFALSE && q.choices.length !== 2) {
      ctx.addIssue({ code: 'custom', path: ['choices'], message: 'سؤال صح/خطأ له اختياران فقط' });
    }
    const texts = q.choices.map((c) => c.text.trim());
    if (new Set(texts).size !== texts.length) {
      ctx.addIssue({ code: 'custom', path: ['choices'], message: 'لا تكرّر نفس الاختيار' });
    }
    const ids = q.choices.flatMap((c) => (c.id ? [c.id] : []));
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['choices'], message: 'اختيارات مكرّرة' });
    }
  });
export type QuestionInput = z.infer<typeof questionInput>;

const examFields = {
  title: z.string().trim().min(3, 'العنوان قصير').max(160),
  description: z.string().trim().max(1000).default(''),
  // امتحان كورس (يتطلب اشتراكاً ساريًا) أو امتحان عام للصف
  courseId: dbId.nullable().optional(),
  grade: z.nativeEnum(Grade),
  durationMin: z.number().int().min(1, 'دقيقة على الأقل').max(300),
  startAt: z.coerce.date().nullable().optional(),
  endAt: z.coerce.date().nullable().optional(),
  shuffle: z.boolean().default(true),
  // متى تظهر الدرجة والمراجعة: الافتراضي الأكثر أماناً (المس تعلنها) حتى لا تتسرّب الإجابات
  resultRelease: z.nativeEnum(ResultRelease).default(ResultRelease.MANUAL),
  // نسبة مئوية من مجموع الدرجات
  passScore: z.number().int().min(0).max(100).default(50),
  notifyParent: z.boolean().default(true),
  isPublished: z.boolean().default(false),
};

const windowOk = (d: { startAt?: Date | null; endAt?: Date | null }) =>
  !d.startAt || !d.endAt || d.endAt > d.startAt;
const windowMsg = { message: 'موعد النهاية يجب أن يكون بعد البداية', path: ['endAt'] };
export const AFTER_END_NEEDS_END_MSG = 'حدّد موعد نهاية الامتحان لإظهار النتيجة بعد انتهائه';

export const examCreateSchema = z
  .object(examFields)
  .refine(windowOk, windowMsg)
  .refine((d) => d.resultRelease !== ResultRelease.AFTER_END || !!d.endAt, {
    message: AFTER_END_NEEDS_END_MSG,
    path: ['resultRelease'],
  });
export type ExamCreateInput = z.infer<typeof examCreateSchema>;

// التحقق بعد الدمج مع القيم الحالية (النافذة/AFTER_END) يتم في الخدمة
export const examUpdateSchema = z.object(examFields).partial().refine(windowOk, windowMsg);
export type ExamUpdateInput = z.infer<typeof examUpdateSchema>;

export const adminExamFilterSchema = z.object({
  grade: z.nativeEnum(Grade).optional(),
  courseId: z.coerce.number().int().positive().max(2_147_483_647).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminExamFilter = z.infer<typeof adminExamFilterSchema>;

export const adminAttemptsFilterSchema = z.object({
  status: z.nativeEnum(AttemptStatus).optional(),
  // PENDING: سلّم وينتظر تصحيح المس للأسئلة الكتابية
  grading: z.enum(['PENDING', 'GRADED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type AdminAttemptsFilter = z.infer<typeof adminAttemptsFilterSchema>;

// حفظ تلقائي لإجابة سؤال واحد: اختيار (موضوعي) أو نص (كتابي) — واحد فقط
export const answerSchema = z
  .object({
    questionId: dbId,
    choiceId: dbId.optional(),
    text: z.string().max(ANSWER_TEXT_MAX.ESSAY).optional(),
  })
  .refine((a) => (a.choiceId === undefined) !== (a.text === undefined), {
    message: 'أرسل اختياراً أو نصاً',
    path: ['choiceId'],
  });
export type AnswerInput = z.infer<typeof answerSchema>;

// تصحيح المس للأسئلة الكتابية في محاولة واحدة
export const gradeAttemptSchema = z.object({
  grades: z
    .array(
      z.object({
        questionId: dbId,
        points: z.number().int().min(0).max(100),
        feedback: z.string().trim().max(1000).nullable().optional(),
      }),
    )
    .min(1)
    .max(200)
    .refine((g) => new Set(g.map((x) => x.questionId)).size === g.length, 'أسئلة مكرّرة'),
});
export type GradeAttemptInput = z.infer<typeof gradeAttemptSchema>;

// إعلان النتائج (وضع MANUAL) أو سحبها
export const releaseResultsSchema = z.object({ released: z.boolean() });

import { z } from 'zod';
import { CodeStatus, PaymentStatus, PaymentPurpose } from '../enums.js';
import { egyptianPhone } from './common.js';
import { normalizeRedeemCode, REDEEM_CODE_LENGTH, TOPUP_LIMITS } from '../constants.js';

// الطالب قد يكتب الكود بشرطات أو مسافات أو أحرف صغيرة
export const redeemSchema = z.object({
  code: z
    .string()
    .max(40)
    .transform(normalizeRedeemCode)
    .refine((c) => c.length === REDEEM_CODE_LENGTH && /^[A-Z0-9]+$/.test(c), 'صيغة الكود غير صحيحة'),
});
export type RedeemInput = z.infer<typeof redeemSchema>;

export const codeBatchSchema = z.object({
  label: z.string().trim().min(2).max(80),
  value: z.number().int().min(100).max(10_000 * 100), // بالقرش (1 – 10,000 جنيه)
  count: z.number().int().min(1).max(5000),
});
export type CodeBatchInput = z.infer<typeof codeBatchSchema>;

export const paymobInitSchema = z
  .object({
    courseId: z.number().int().positive().optional(),
    topupAmount: z.number().int().min(TOPUP_LIMITS.min).max(TOPUP_LIMITS.max).optional(),
  })
  .refine((d) => (d.courseId === undefined) !== (d.topupAmount === undefined), {
    message: 'حدّد كورس أو مبلغ شحن (واحد فقط)',
  });
export type PaymobInitInput = z.infer<typeof paymobInitSchema>;

const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const adminCodesFilterSchema = z.object({
  status: z.nativeEnum(CodeStatus).optional(),
  batchId: z.coerce.number().int().positive().optional(),
  ...page,
});
export type AdminCodesFilter = z.infer<typeof adminCodesFilterSchema>;

export const adminPaymentsFilterSchema = z.object({
  status: z.nativeEnum(PaymentStatus).optional(),
  purpose: z.nativeEnum(PaymentPurpose).optional(),
  ...page,
});
export type AdminPaymentsFilter = z.infer<typeof adminPaymentsFilterSchema>;

// شحن يدوي من الإدارة (بالقرش) — الطالب يُحدَّد برقم موبايله
export const adminTopupSchema = z.object({
  phone: egyptianPhone,
  amount: z.number().int().min(100).max(10_000 * 100),
  note: z.string().trim().min(3, 'اكتب سبب الشحن').max(200),
});
export type AdminTopupInput = z.infer<typeof adminTopupSchema>;

export const adminEnrollSchema = z.object({
  phone: egyptianPhone,
  courseId: z.number().int().positive(),
  note: z.string().trim().max(200).default(''),
});
export type AdminEnrollInput = z.infer<typeof adminEnrollSchema>;

import { z } from 'zod';
import { Grade } from '../enums.js';
import { DB_ID_MAX, egyptianPhone, pageNumber } from './common.js';

// ── لوحة الأدمن: الطلاب، المساعدون، الإعدادات، سجل العمليات (Phase 8) ──

const pageShape = {
  page: pageNumber,
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
};
const queryId = z.coerce.number().int().positive().max(DB_ID_MAX);
// حقل بحث فارغ من الواجهة (?q=) = بلا فلتر
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

// ── الطلاب ──────────────────────────────────────────────────────
export const adminStudentsFilterSchema = z.object({
  // جزء من الاسم أو الموبايل (ILIKE) — حرفان على الأقل
  q: z.preprocess(blankToUndefined, z.string().trim().min(2, 'اكتب حرفين على الأقل').max(60).optional()),
  grade: z.nativeEnum(Grade).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  ...pageShape,
});
export type AdminStudentsFilter = z.infer<typeof adminStudentsFilterSchema>;

export const userStatusSchema = z.object({ isActive: z.boolean() }).strict();
export type UserStatusInput = z.infer<typeof userStatusSchema>;

export const userDeviceParams = z.object({ id: queryId, deviceId: queryId });

// ── المساعدون (كلمة المرور تُولَّد في الخادم وتُعرض مرة واحدة) ─────────
export const staffCreateSchema = z
  .object({
    name: z.string().trim().min(3, 'الاسم قصير جداً').max(80),
    phone: egyptianPhone,
    email: z.preprocess(blankToUndefined, z.string().trim().toLowerCase().email('بريد غير صحيح').max(120).optional()),
  })
  .strict();
export type StaffCreateInput = z.infer<typeof staffCreateSchema>;

// ── إعدادات المنصة ──────────────────────────────────────────────
export const settingsUpdateSchema = z.object({ requirePhoneVerification: z.boolean() }).strict();
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;

// ── سجل العمليات ────────────────────────────────────────────────
export const auditLogFilterSchema = z
  .object({
    action: z.preprocess(blankToUndefined, z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'اسم عملية غير صحيح').optional()),
    entity: z.preprocess(blankToUndefined, z.string().regex(/^[A-Z][A-Za-z]{1,39}$/, 'اسم كيان غير صحيح').optional()),
    actorId: z.preprocess(blankToUndefined, queryId.optional()),
    from: z.preprocess(blankToUndefined, z.string().datetime('تاريخ غير صحيح').optional()),
    to: z.preprocess(blankToUndefined, z.string().datetime('تاريخ غير صحيح').optional()),
    ...pageShape,
  })
  .refine((f) => !f.from || !f.to || Date.parse(f.from) <= Date.parse(f.to), { path: ['to'], message: 'نهاية المدة قبل بدايتها' });
export type AuditLogFilter = z.infer<typeof auditLogFilterSchema>;

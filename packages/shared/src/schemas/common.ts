import { z } from 'zod';

// موبايل مصري: 01 ثم 0/1/2/5 ثم 8 أرقام
export const egyptianPhone = z
  .string()
  .regex(/^01[0125]\d{8}$/, 'رقم موبايل مصري غير صحيح');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
});
export type Pagination = z.infer<typeof paginationSchema>;

// معرّف صف في القاعدة (INT4): أكبر من 2^31-1 يُرفض بـ 400 بدل خطأ 500 من Prisma
export const DB_ID_MAX = 2_147_483_647;
export const dbId = z.number().int().positive().max(DB_ID_MAX);
export const idParam = z.object({ id: z.coerce.number().int().positive().max(DB_ID_MAX) });

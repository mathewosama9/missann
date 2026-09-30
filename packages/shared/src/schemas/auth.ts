import { z } from 'zod';
import { egyptianPhone } from './common.js';
import { Grade, OtpPurpose } from '../enums.js';

export const registerSchema = z
  .object({
    name: z.string().min(3, 'الاسم قصير جداً').max(80),
    phone: egyptianPhone,
    parentPhone: egyptianPhone,
    email: z.string().email('بريد غير صحيح').optional().or(z.literal('')),
    password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل').max(128),
    confirmPassword: z.string(),
    grade: z.nativeEnum(Grade),
    governorate: z.string().min(2),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirmPassword'],
  })
  .refine((d) => d.phone !== d.parentPhone, {
    message: 'رقم ولي الأمر يجب أن يختلف عن رقم الطالب',
    path: ['parentPhone'],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().min(3, 'أدخل الموبايل أو البريد'),
  password: z.string().min(1, 'أدخل كلمة المرور'),
  deviceFingerprint: z.string().min(6).max(128),
  rememberMe: z.boolean().optional().default(false),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyOtpSchema = z.object({
  phone: egyptianPhone,
  code: z.string().length(6, 'الكود 6 أرقام'),
  purpose: z.nativeEnum(OtpPurpose),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const forgotPasswordSchema = z.object({ phone: egyptianPhone });

export const resetPasswordSchema = z.object({
  phone: egyptianPhone,
  code: z.string().length(6),
  newPassword: z.string().min(8).max(128),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

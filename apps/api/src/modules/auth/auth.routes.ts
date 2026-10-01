import { Router } from 'express';
import {
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  idParam,
  changePasswordSchema,
} from '@miss-ann/shared';
import { asyncHandler } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { authGuard } from '../../middleware/authGuard.js';
import { authLimiter, refreshLimiter } from '../../middleware/rateLimit.js';
import { sameOriginOnly } from '../../middleware/sameOrigin.js';
import * as c from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', authLimiter, validate(registerSchema), asyncHandler(c.registerHandler));
authRouter.post('/verify-otp', authLimiter, validate(verifyOtpSchema), asyncHandler(c.verifyOtpHandler));
authRouter.post('/login', authLimiter, validate(loginSchema), asyncHandler(c.loginHandler));
// التجديد والخروج يعتمدان على الكوكي وحده ← فحص المصدر (CSRF) + سقف طلبات
authRouter.post('/refresh', refreshLimiter, sameOriginOnly, asyncHandler(c.refreshHandler));
authRouter.post('/logout', sameOriginOnly, asyncHandler(c.logoutHandler));
authRouter.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), asyncHandler(c.forgotPasswordHandler));
authRouter.post('/reset-password', authLimiter, validate(resetPasswordSchema), asyncHandler(c.resetPasswordHandler));
authRouter.get('/me', authGuard, asyncHandler(c.meHandler));
// تخمين كلمة المرور الحالية بتوكن مسروق ← نفس سقف تسجيل الدخول
authRouter.post('/change-password', authGuard, authLimiter, validate(changePasswordSchema), asyncHandler(c.changePasswordHandler));
authRouter.get('/devices', authGuard, asyncHandler(c.listDevicesHandler));
authRouter.delete('/devices/:id', authGuard, validate(idParam, 'params'), asyncHandler(c.removeDeviceHandler));

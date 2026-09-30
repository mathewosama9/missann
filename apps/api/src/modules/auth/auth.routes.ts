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
import { authLimiter } from '../../middleware/rateLimit.js';
import * as c from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', authLimiter, validate(registerSchema), asyncHandler(c.registerHandler));
authRouter.post('/verify-otp', authLimiter, validate(verifyOtpSchema), asyncHandler(c.verifyOtpHandler));
authRouter.post('/login', authLimiter, validate(loginSchema), asyncHandler(c.loginHandler));
authRouter.post('/refresh', asyncHandler(c.refreshHandler));
authRouter.post('/logout', asyncHandler(c.logoutHandler));
authRouter.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), asyncHandler(c.forgotPasswordHandler));
authRouter.post('/reset-password', authLimiter, validate(resetPasswordSchema), asyncHandler(c.resetPasswordHandler));
authRouter.get('/me', authGuard, asyncHandler(c.meHandler));
authRouter.post('/change-password', authGuard, validate(changePasswordSchema), asyncHandler(c.changePasswordHandler));
authRouter.get('/devices', authGuard, asyncHandler(c.listDevicesHandler));
authRouter.delete('/devices/:id', authGuard, validate(idParam, 'params'), asyncHandler(c.removeDeviceHandler));

import { Router } from 'express';
import { idParam, paymobInitSchema, Role } from '@miss-ann/shared';
import { asyncHandler } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { authGuard } from '../../middleware/authGuard.js';
import { rbacGuard } from '../../middleware/rbacGuard.js';
import { webhookLimiter } from '../../middleware/rateLimit.js';
import * as c from './payments.controller.js';

export const paymentsRouter = Router();

// بدون مصادقة: الحماية بتوقيع HMAC داخل المعالج
paymentsRouter.post('/paymob/webhook', webhookLimiter, asyncHandler(c.webhookHandler));

paymentsRouter.post(
  '/paymob/init',
  authGuard,
  rbacGuard(Role.STUDENT),
  validate(paymobInitSchema),
  asyncHandler(c.initHandler),
);
paymentsRouter.get('/:id', authGuard, validate(idParam, 'params'), asyncHandler(c.paymentHandler));

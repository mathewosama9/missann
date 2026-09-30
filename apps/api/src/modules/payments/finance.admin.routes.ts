import { Router } from 'express';
import { z } from 'zod';
import {
  adminEnrollSchema,
  adminPaymentsFilterSchema,
  adminTopupSchema,
  egyptianPhone,
  Role,
} from '@miss-ann/shared';
import { asyncHandler } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { authGuard } from '../../middleware/authGuard.js';
import { rbacGuard } from '../../middleware/rbacGuard.js';
import * as c from './finance.admin.controller.js';

// المدفوعات + الشحن/الاشتراك اليدوي — للأدمن فقط
export const financeAdminRouter = Router();

const adminOnly = [authGuard, rbacGuard(Role.ADMIN)];

financeAdminRouter.get(
  '/payments',
  adminOnly,
  validate(adminPaymentsFilterSchema, 'query'),
  asyncHandler(c.listPaymentsHandler),
);
financeAdminRouter.get(
  '/students/lookup',
  adminOnly,
  validate(z.object({ phone: egyptianPhone }), 'query'),
  asyncHandler(c.lookupHandler),
);
financeAdminRouter.post('/wallet/topup', adminOnly, validate(adminTopupSchema), asyncHandler(c.topupHandler));
financeAdminRouter.post('/enrollments', adminOnly, validate(adminEnrollSchema), asyncHandler(c.enrollHandler));

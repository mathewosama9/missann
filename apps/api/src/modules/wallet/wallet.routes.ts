import { Router } from 'express';
import { redeemSchema, Role } from '@miss-ann/shared';
import { asyncHandler } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { authGuard } from '../../middleware/authGuard.js';
import { rbacGuard } from '../../middleware/rbacGuard.js';
import { redeemLimiter } from '../../middleware/rateLimit.js';
import * as c from './wallet.controller.js';

// محفظة الطالب: الرصيد + الشحن بكارت
export const walletRouter = Router();
walletRouter.use(authGuard);

walletRouter.get('/', asyncHandler(c.walletHandler));
walletRouter.post(
  '/redeem',
  rbacGuard(Role.STUDENT),
  redeemLimiter,
  validate(redeemSchema),
  asyncHandler(c.redeemHandler),
);

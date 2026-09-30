import { Router, type Request, type Response } from 'express';
import { Role } from '@miss-ann/shared';
import { asyncHandler } from '../../lib/http.js';
import { authGuard } from '../../middleware/authGuard.js';
import { rbacGuard } from '../../middleware/rbacGuard.js';
import { getStats } from './stats.admin.service.js';

// إحصائيات المنصة (فيها الإيراد) — أدمن فقط
export const adminStatsRouter = Router();
adminStatsRouter.use(authGuard, rbacGuard(Role.ADMIN));
adminStatsRouter.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    res.json(await getStats());
  }),
);

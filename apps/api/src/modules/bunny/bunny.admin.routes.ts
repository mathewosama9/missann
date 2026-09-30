import { Router } from 'express';
import { bunnyCreateVideoSchema, idParam, Role } from '@miss-ann/shared';
import { asyncHandler } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { authGuard } from '../../middleware/authGuard.js';
import { rbacGuard } from '../../middleware/rbacGuard.js';
import * as c from './bunny.admin.controller.js';

// رفع فيديوهات الحصص إلى Bunny Stream (أدمن/مساعد)
export const bunnyAdminRouter = Router();
bunnyAdminRouter.use(authGuard, rbacGuard(Role.ADMIN, Role.ASSISTANT));

bunnyAdminRouter.post(
  '/create-video',
  validate(bunnyCreateVideoSchema),
  asyncHandler(c.createVideoHandler),
);
// حالة معالجة فيديو الحصة + مزامنة المدة عند الانتهاء
bunnyAdminRouter.get(
  '/lessons/:id/status',
  validate(idParam, 'params'),
  asyncHandler(c.videoStatusHandler),
);

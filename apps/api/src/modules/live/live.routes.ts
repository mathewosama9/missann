import { Router } from 'express';
import { liveListFilterSchema, Role } from '@miss-ann/shared';
import { asyncHandler } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { authGuard } from '../../middleware/authGuard.js';
import { rbacGuard } from '../../middleware/rbacGuard.js';
import * as c from './live.controller.js';

// الحصص اللايف للطالب: جلسات كورساته فقط، والرابط داخل نافذة الانضمام فقط
export const liveRouter = Router();
liveRouter.use(authGuard, rbacGuard(Role.STUDENT));

liveRouter.get('/', validate(liveListFilterSchema, 'query'), asyncHandler(c.listHandler));

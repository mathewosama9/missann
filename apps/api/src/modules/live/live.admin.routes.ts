import { Router } from 'express';
import { adminLiveFilterSchema, idParam, liveCreateSchema, liveUpdateSchema, Role } from '@miss-ann/shared';
import { asyncHandler } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { authGuard } from '../../middleware/authGuard.js';
import { rbacGuard } from '../../middleware/rbacGuard.js';
import * as c from './live.controller.js';

// جدولة الحصص اللايف: أدمن + مساعد (مركّبة على /admin/live فقط)
const withId = validate(idParam, 'params');

export const adminLiveRouter = Router();
adminLiveRouter.use(authGuard, rbacGuard(Role.ADMIN, Role.ASSISTANT));

adminLiveRouter.get('/', validate(adminLiveFilterSchema, 'query'), asyncHandler(c.adminListHandler));
adminLiveRouter.post('/', validate(liveCreateSchema), asyncHandler(c.createHandler));
adminLiveRouter.patch('/:id', withId, validate(liveUpdateSchema), asyncHandler(c.updateHandler));
adminLiveRouter.delete('/:id', withId, asyncHandler(c.deleteHandler));

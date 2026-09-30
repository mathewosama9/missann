import { Router } from 'express';
import { adminStudentsFilterSchema, idParam, Role, staffCreateSchema, userDeviceParams, userStatusSchema } from '@miss-ann/shared';
import { asyncHandler } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { authGuard } from '../../middleware/authGuard.js';
import { rbacGuard } from '../../middleware/rbacGuard.js';
import * as c from './users.admin.controller.js';

// إدارة الحسابات: أدمن فقط (بيانات شخصية، تعطيل، كلمات مرور)
const withId = validate(idParam, 'params');

// /admin/students — المعرّف أرقام فقط (\d+) حتى يمر /admin/students/lookup لمساره في financeAdminRouter
export const adminStudentsRouter = Router();
adminStudentsRouter.use(authGuard, rbacGuard(Role.ADMIN));
adminStudentsRouter.get('/', validate(adminStudentsFilterSchema, 'query'), asyncHandler(c.listStudentsHandler));
adminStudentsRouter.get('/:id(\\d+)', withId, asyncHandler(c.studentDetailHandler));
adminStudentsRouter.patch('/:id(\\d+)/status', withId, validate(userStatusSchema), asyncHandler(c.studentStatusHandler));
adminStudentsRouter.post('/:id(\\d+)/reset-password', withId, asyncHandler(c.studentResetPasswordHandler));
adminStudentsRouter.delete(
  '/:id(\\d+)/devices/:deviceId(\\d+)',
  validate(userDeviceParams, 'params'),
  asyncHandler(c.studentRemoveDeviceHandler),
);

// /admin/staff — المساعدون فقط (الأدمن لا يُعطَّل ولا تُغيَّر كلمته من هنا)
export const adminStaffRouter = Router();
adminStaffRouter.use(authGuard, rbacGuard(Role.ADMIN));
adminStaffRouter.get('/', asyncHandler(c.listStaffHandler));
adminStaffRouter.post('/', validate(staffCreateSchema), asyncHandler(c.createStaffHandler));
adminStaffRouter.patch('/:id/status', withId, validate(userStatusSchema), asyncHandler(c.staffStatusHandler));
adminStaffRouter.post('/:id/reset-password', withId, asyncHandler(c.staffResetPasswordHandler));

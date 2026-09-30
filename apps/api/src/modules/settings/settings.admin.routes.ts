import { Router } from 'express';
import { auditLogFilterSchema, Role, settingsUpdateSchema } from '@miss-ann/shared';
import { asyncHandler } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { authGuard } from '../../middleware/authGuard.js';
import { rbacGuard } from '../../middleware/rbacGuard.js';
import * as c from './settings.admin.controller.js';

// إعدادات المنصة وسجل العمليات: أدمن فقط
export const adminSettingsRouter = Router();
adminSettingsRouter.use(authGuard, rbacGuard(Role.ADMIN));
adminSettingsRouter.get('/', asyncHandler(c.getSettingsHandler));
adminSettingsRouter.put('/', validate(settingsUpdateSchema), asyncHandler(c.updateSettingsHandler));

export const adminAuditRouter = Router();
adminAuditRouter.use(authGuard, rbacGuard(Role.ADMIN));
adminAuditRouter.get('/', validate(auditLogFilterSchema, 'query'), asyncHandler(c.listAuditLogsHandler));

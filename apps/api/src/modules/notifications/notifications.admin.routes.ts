import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  adminMessagesFilterSchema,
  broadcastListSchema,
  broadcastSchema,
  Role,
  templateContentSchema,
  templateCreateSchema,
  templateParams,
} from '@miss-ann/shared';
import { asyncHandler } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { authGuard } from '../../middleware/authGuard.js';
import { rbacGuard } from '../../middleware/rbacGuard.js';
import { broadcastLimiter } from '../../middleware/rateLimit.js';
import * as c from './notifications.admin.controller.js';

// الإرسال الجماعي والقوالب: أدمن فقط (يصل لكل الطلاب ورسائل واتساب لها تكلفة)
export const adminNotificationsRouter = Router();
adminNotificationsRouter.use(authGuard, rbacGuard(Role.ADMIN));

const withTemplate = validate(templateParams, 'params');
// متغيّرات النص تُفحص مقابل المفتاح والقناة في المسار (بعد التحقق منهما)
const validContent = (req: Request, res: Response, next: NextFunction) =>
  validate(templateContentSchema(req.params.key!, req.params.channel!))(req, res, next);

// السقف بعد التحقق: يُحتسب الإرسال الفعلي فقط (الطلب المرفوض لا يكلّف شيئاً)
adminNotificationsRouter.post('/broadcast', validate(broadcastSchema), broadcastLimiter, asyncHandler(c.broadcastHandler));
adminNotificationsRouter.get('/broadcasts', validate(broadcastListSchema, 'query'), asyncHandler(c.listBroadcastsHandler));
adminNotificationsRouter.get('/messages', validate(adminMessagesFilterSchema, 'query'), asyncHandler(c.listMessagesHandler));
adminNotificationsRouter.get('/templates', asyncHandler(c.listTemplatesHandler));
adminNotificationsRouter.post('/templates', validate(templateCreateSchema), asyncHandler(c.createTemplateHandler));
adminNotificationsRouter.put('/templates/:key/:channel', withTemplate, validContent, asyncHandler(c.saveTemplateHandler));
adminNotificationsRouter.delete('/templates/:key/:channel', withTemplate, asyncHandler(c.deleteTemplateHandler));

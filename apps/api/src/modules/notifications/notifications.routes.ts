import { Router } from 'express';
import { idParam, notificationListSchema } from '@miss-ann/shared';
import { asyncHandler } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { authGuard } from '../../middleware/authGuard.js';
import * as c from './notifications.controller.js';

// صندوق الإشعارات: أي مستخدم مسجّل (طالب/أدمن/مساعد) — الملكية تُفحص في الخدمة (404 لإشعار غيره)
export const notificationsRouter = Router();
notificationsRouter.use(authGuard);

notificationsRouter.get('/', validate(notificationListSchema, 'query'), asyncHandler(c.listHandler));
notificationsRouter.get('/unread-count', asyncHandler(c.unreadCountHandler));
notificationsRouter.patch('/read-all', asyncHandler(c.readAllHandler));
notificationsRouter.patch('/:id/read', validate(idParam, 'params'), asyncHandler(c.readHandler));

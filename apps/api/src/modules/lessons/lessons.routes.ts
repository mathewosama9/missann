import { Router } from 'express';
import { idParam, progressSchema } from '@miss-ann/shared';
import { asyncHandler } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { authGuard } from '../../middleware/authGuard.js';
import { playbackLimiter } from '../../middleware/rateLimit.js';
import * as c from './lessons.controller.js';

// تشغيل الحصص وتتبّع التقدّم — يتطلب دخولاً (العلامة المائية باسم الطالب)
export const lessonsRouter = Router();
lessonsRouter.use(authGuard, playbackLimiter);

lessonsRouter.get('/:id/play', validate(idParam, 'params'), asyncHandler(c.playHandler));
lessonsRouter.post(
  '/:id/progress',
  validate(idParam, 'params'),
  validate(progressSchema),
  asyncHandler(c.progressHandler),
);

import { Router } from 'express';
import { courseFilterSchema, idParam, Role } from '@miss-ann/shared';
import { z } from 'zod';
import { asyncHandler } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { optionalAuth } from '../../middleware/optionalAuth.js';
import { authGuard } from '../../middleware/authGuard.js';
import { rbacGuard } from '../../middleware/rbacGuard.js';
import * as c from './courses.controller.js';

export const coursesRouter = Router();

// مسار حصة داخل كورس: يحتاج معرّفين
const lessonParams = z.object({
  id: z.coerce.number().int().positive(),
  lessonId: z.coerce.number().int().positive(),
});

// كتالوج عام (منشور فقط)
coursesRouter.get('/', validate(courseFilterSchema, 'query'), asyncHandler(c.listCoursesHandler));

// تفاصيل كورس — optionalAuth لحساب حالة الاشتراك إن كان مسجّلاً
coursesRouter.get(
  '/:id',
  validate(idParam, 'params'),
  optionalAuth,
  asyncHandler(c.courseDetailHandler),
);

// مرجع حصة (معاينة مجانية للجميع، غيرها يتطلب اشتراكاً)
coursesRouter.get(
  '/:id/lessons/:lessonId',
  validate(lessonParams, 'params'),
  optionalAuth,
  asyncHandler(c.lessonAccessHandler),
);

// الاشتراك بالدفع من المحفظة (أو تفعيل مباشر للكورس المجاني)
coursesRouter.post(
  '/:id/subscribe',
  authGuard,
  rbacGuard(Role.STUDENT),
  validate(idParam, 'params'),
  asyncHandler(c.subscribeHandler),
);

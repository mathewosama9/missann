import { Router } from 'express';
import {
  courseCreateSchema,
  courseUpdateSchema,
  coursePublishSchema,
  adminCourseFilterSchema,
  lessonCreateSchema,
  lessonUpdateSchema,
  attachmentCreateSchema,
  reorderSchema,
  idParam,
  Role,
} from '@miss-ann/shared';
import { asyncHandler } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { authGuard } from '../../middleware/authGuard.js';
import { rbacGuard } from '../../middleware/rbacGuard.js';
import * as c from './courses.admin.controller.js';

// كل مسارات إدارة المحتوى تتطلب دخولاً + دور أدمن/مساعد
export const adminContentRouter = Router();
adminContentRouter.use(authGuard, rbacGuard(Role.ADMIN, Role.ASSISTANT));

// ── الكورسات ────────────────────────────────────────────────────
adminContentRouter.get(
  '/courses',
  validate(adminCourseFilterSchema, 'query'),
  asyncHandler(c.listHandler),
);
adminContentRouter.post('/courses', validate(courseCreateSchema), asyncHandler(c.createHandler));
adminContentRouter.get(
  '/courses/:id',
  validate(idParam, 'params'),
  asyncHandler(c.detailHandler),
);
adminContentRouter.patch(
  '/courses/:id',
  validate(idParam, 'params'),
  validate(courseUpdateSchema),
  asyncHandler(c.updateHandler),
);
adminContentRouter.patch(
  '/courses/:id/publish',
  validate(idParam, 'params'),
  validate(coursePublishSchema),
  asyncHandler(c.publishHandler),
);
// حذف كورس كامل (بحصصه واشتراكاته) للأدمن فقط — المساعد لا يحذف
adminContentRouter.delete(
  '/courses/:id',
  rbacGuard(Role.ADMIN),
  validate(idParam, 'params'),
  asyncHandler(c.deleteHandler),
);

// ── الحصص ───────────────────────────────────────────────────────
adminContentRouter.post(
  '/courses/:id/lessons',
  validate(idParam, 'params'),
  validate(lessonCreateSchema),
  asyncHandler(c.addLessonHandler),
);
adminContentRouter.patch(
  '/courses/:id/lessons/reorder',
  validate(idParam, 'params'),
  validate(reorderSchema),
  asyncHandler(c.reorderLessonsHandler),
);
adminContentRouter.patch(
  '/lessons/:id',
  validate(idParam, 'params'),
  validate(lessonUpdateSchema),
  asyncHandler(c.updateLessonHandler),
);
adminContentRouter.delete(
  '/lessons/:id',
  validate(idParam, 'params'),
  asyncHandler(c.deleteLessonHandler),
);

// ── المرفقات ────────────────────────────────────────────────────
adminContentRouter.post(
  '/lessons/:id/attachments',
  validate(idParam, 'params'),
  validate(attachmentCreateSchema),
  asyncHandler(c.addAttachmentHandler),
);
adminContentRouter.delete(
  '/attachments/:id',
  validate(idParam, 'params'),
  asyncHandler(c.deleteAttachmentHandler),
);

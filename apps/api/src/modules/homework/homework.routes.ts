import { Router } from 'express';
import { HOMEWORK_FILE_TYPES, homeworkListFilterSchema, idParam, Role, UPLOAD_LIMITS } from '@miss-ann/shared';
import { asyncHandler } from '../../lib/http.js';
import { singleFileUpload } from '../../lib/uploads.js';
import { validate } from '../../middleware/validate.js';
import { authGuard } from '../../middleware/authGuard.js';
import { rbacGuard } from '../../middleware/rbacGuard.js';
import { fileDownloadLimiter, homeworkSubmitLimiter } from '../../middleware/rateLimit.js';
import * as c from './homework.controller.js';

// واجبات الطالب. مسارات الملفات مفتوحة لأي مستخدم مصادَق والصلاحية تُفحص في الخدمة:
// المالك (باشتراك ساري) أو فريق العمل، وغيرهم 404.
const student = rbacGuard(Role.STUDENT);
const withId = validate(idParam, 'params');
const solutionFile = singleFileUpload(
  'file',
  UPLOAD_LIMITS.homeworkMaxBytes,
  HOMEWORK_FILE_TYPES,
  'نوع الملف غير مسموح — PDF أو صورة JPG/PNG/WEBP فقط',
);

export const homeworkRouter = Router();
homeworkRouter.use(authGuard);

homeworkRouter.get('/', student, validate(homeworkListFilterSchema, 'query'), asyncHandler(c.listHandler));
homeworkRouter.get('/submissions/:id/file', fileDownloadLimiter, withId, asyncHandler(c.submissionFileHandler));
homeworkRouter.get('/:id/attachment', fileDownloadLimiter, withId, asyncHandler(c.attachmentHandler));
homeworkRouter.get('/:id/submission', student, withId, asyncHandler(c.submissionHandler));
homeworkRouter.post(
  '/:id/submit',
  student,
  homeworkSubmitLimiter,
  withId,
  asyncHandler(c.precheckHandler),
  solutionFile,
  asyncHandler(c.submitHandler),
);

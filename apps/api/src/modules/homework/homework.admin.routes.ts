import { Router } from 'express';
import {
  adminHomeworkFilterSchema,
  adminSubmissionsFilterSchema,
  gradeSubmissionSchema,
  HOMEWORK_FILE_TYPES,
  homeworkCreateSchema,
  homeworkUpdateSchema,
  idParam,
  Role,
  submissionParams,
  UPLOAD_LIMITS,
} from '@miss-ann/shared';
import { asyncHandler } from '../../lib/http.js';
import { singleFileUpload } from '../../lib/uploads.js';
import { validate } from '../../middleware/validate.js';
import { authGuard } from '../../middleware/authGuard.js';
import { rbacGuard } from '../../middleware/rbacGuard.js';
import * as c from './homework.admin.controller.js';

// الواجبات والتصحيح: أدمن + مساعد (مركّبة على /admin/homework فقط فلا تحجب غيرها)
const withId = validate(idParam, 'params');
const attachmentFile = singleFileUpload(
  'file',
  Math.max(UPLOAD_LIMITS.pdfMaxBytes, UPLOAD_LIMITS.imageMaxBytes),
  HOMEWORK_FILE_TYPES,
  'نوع الملف غير مسموح — PDF أو صورة JPG/PNG/WEBP فقط',
);

export const adminHomeworkRouter = Router();
adminHomeworkRouter.use(authGuard, rbacGuard(Role.ADMIN, Role.ASSISTANT));

adminHomeworkRouter.get('/', validate(adminHomeworkFilterSchema, 'query'), asyncHandler(c.listHandler));
adminHomeworkRouter.post('/', validate(homeworkCreateSchema), asyncHandler(c.createHandler));
adminHomeworkRouter.get('/:id', withId, asyncHandler(c.detailHandler));
adminHomeworkRouter.patch('/:id', withId, validate(homeworkUpdateSchema), asyncHandler(c.updateHandler));
adminHomeworkRouter.delete('/:id', withId, asyncHandler(c.deleteHandler));
adminHomeworkRouter.post('/:id/attachment', withId, attachmentFile, asyncHandler(c.setAttachmentHandler));
adminHomeworkRouter.delete('/:id/attachment', withId, asyncHandler(c.removeAttachmentHandler));
adminHomeworkRouter.get(
  '/:id/submissions',
  withId,
  validate(adminSubmissionsFilterSchema, 'query'),
  asyncHandler(c.submissionsHandler),
);
adminHomeworkRouter.patch(
  '/:id/submissions/:submissionId/grade',
  validate(submissionParams, 'params'),
  validate(gradeSubmissionSchema),
  asyncHandler(c.gradeHandler),
);

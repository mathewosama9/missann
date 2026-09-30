import { Router } from 'express';
import {
  adminAttemptsFilterSchema,
  adminExamFilterSchema,
  examCreateSchema,
  examUpdateSchema,
  gradeAttemptSchema,
  idParam,
  questionInput,
  releaseResultsSchema,
  reorderSchema,
  Role,
} from '@miss-ann/shared';
import { asyncHandler } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { authGuard } from '../../middleware/authGuard.js';
import { rbacGuard } from '../../middleware/rbacGuard.js';
import * as c from './exams.admin.controller.js';

// الامتحانات والتصحيح محتوى تعليمي: أدمن + مساعد (مركّبة على /admin/exams و /admin/questions و /admin/attempts فقط)
const staff = [authGuard, rbacGuard(Role.ADMIN, Role.ASSISTANT)];
const withId = validate(idParam, 'params');

export const adminExamsRouter = Router();
adminExamsRouter.use(staff);

adminExamsRouter.get('/', validate(adminExamFilterSchema, 'query'), asyncHandler(c.listHandler));
adminExamsRouter.post('/', validate(examCreateSchema), asyncHandler(c.createHandler));
adminExamsRouter.get('/:id', withId, asyncHandler(c.detailHandler));
adminExamsRouter.patch('/:id', withId, validate(examUpdateSchema), asyncHandler(c.updateHandler));
adminExamsRouter.delete('/:id', withId, asyncHandler(c.deleteHandler));
adminExamsRouter.post('/:id/questions', withId, validate(questionInput), asyncHandler(c.addQuestionHandler));
adminExamsRouter.patch('/:id/questions/reorder', withId, validate(reorderSchema), asyncHandler(c.reorderHandler));
adminExamsRouter.post('/:id/release', withId, validate(releaseResultsSchema), asyncHandler(c.releaseHandler));
adminExamsRouter.get('/:id/analytics', withId, asyncHandler(c.analyticsHandler));
adminExamsRouter.get(
  '/:id/attempts',
  withId,
  validate(adminAttemptsFilterSchema, 'query'),
  asyncHandler(c.attemptsHandler),
);

export const adminQuestionsRouter = Router();
adminQuestionsRouter.use(staff);

adminQuestionsRouter.patch('/:id', withId, validate(questionInput), asyncHandler(c.updateQuestionHandler));
adminQuestionsRouter.delete('/:id', withId, asyncHandler(c.deleteQuestionHandler));

// تصحيح المس للأسئلة الكتابية في محاولة طالب
export const adminAttemptsRouter = Router();
adminAttemptsRouter.use(staff);

adminAttemptsRouter.get('/:id', withId, asyncHandler(c.attemptDetailHandler));
adminAttemptsRouter.patch('/:id/grade', withId, validate(gradeAttemptSchema), asyncHandler(c.gradeHandler));

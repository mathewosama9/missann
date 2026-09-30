import { Router } from 'express';
import { answerSchema, idParam, Role } from '@miss-ann/shared';
import { asyncHandler } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { authGuard } from '../../middleware/authGuard.js';
import { rbacGuard } from '../../middleware/rbacGuard.js';
import { examLimiter } from '../../middleware/rateLimit.js';
import * as c from './exams.controller.js';

// امتحانات الطالب
export const examsRouter = Router();
examsRouter.use(authGuard, rbacGuard(Role.STUDENT));

examsRouter.get('/', asyncHandler(c.listHandler));
examsRouter.get('/:id', validate(idParam, 'params'), asyncHandler(c.detailHandler));
examsRouter.post('/:id/start', examLimiter, validate(idParam, 'params'), asyncHandler(c.startHandler));

// محاولات الطالب — الملكية تُفحص في الخدمة (404 لمحاولة غيره)
export const attemptsRouter = Router();
attemptsRouter.use(authGuard, rbacGuard(Role.STUDENT));

attemptsRouter.patch(
  '/:id/answer',
  examLimiter,
  validate(idParam, 'params'),
  validate(answerSchema),
  asyncHandler(c.answerHandler),
);
attemptsRouter.post('/:id/submit', examLimiter, validate(idParam, 'params'), asyncHandler(c.submitHandler));
attemptsRouter.get('/:id/result', validate(idParam, 'params'), asyncHandler(c.resultHandler));

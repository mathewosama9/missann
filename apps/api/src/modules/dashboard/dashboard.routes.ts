import { Router } from 'express';
import { Role } from '@miss-ann/shared';
import { asyncHandler } from '../../lib/http.js';
import { authGuard } from '../../middleware/authGuard.js';
import { rbacGuard } from '../../middleware/rbacGuard.js';
import * as c from './dashboard.controller.js';

// لوحة الطالب: بياناته هو فقط (userId من التوكن)
export const meRouter = Router();
meRouter.use(authGuard, rbacGuard(Role.STUDENT));
meRouter.get('/overview', asyncHandler(c.overviewHandler));
meRouter.get('/courses', asyncHandler(c.myCoursesHandler));

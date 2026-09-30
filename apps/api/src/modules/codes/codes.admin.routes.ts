import { Router } from 'express';
import { adminCodesFilterSchema, codeBatchSchema, idParam, paginationSchema, Role } from '@miss-ann/shared';
import { asyncHandler } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { authGuard } from '../../middleware/authGuard.js';
import { rbacGuard } from '../../middleware/rbacGuard.js';
import * as c from './codes.admin.controller.js';

// كروت الشحن — عمليات مالية: للأدمن فقط
export const codesAdminRouter = Router();
codesAdminRouter.use(authGuard, rbacGuard(Role.ADMIN));

codesAdminRouter.post('/batch', validate(codeBatchSchema), asyncHandler(c.createBatchHandler));
codesAdminRouter.get('/batches', validate(paginationSchema, 'query'), asyncHandler(c.listBatchesHandler));
codesAdminRouter.get('/', validate(adminCodesFilterSchema, 'query'), asyncHandler(c.listCodesHandler));
codesAdminRouter.patch('/:id/disable', validate(idParam, 'params'), asyncHandler(c.disableHandler));

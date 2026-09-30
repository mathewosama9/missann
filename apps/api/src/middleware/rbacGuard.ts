import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@miss-ann/shared';
import { forbidden, unauthorized } from '../lib/http.js';

// السماح للأدوار المحددة فقط
export const rbacGuard =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

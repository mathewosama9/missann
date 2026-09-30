import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/tokens.js';

// يقرأ المستخدم من التوكن إن وُجد وكان صالحاً، وإلا يكمل كزائر (بدون رفض)
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = verifyAccessToken(header.slice(7));
    } catch {
      // توكن غير صالح → نتجاهله ونكمل كزائر
    }
  }
  next();
}

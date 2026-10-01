import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/tokens.js';
import { sessionBlock } from '../lib/userStatus.js';

// يقرأ المستخدم من التوكن إن وُجد وكان صالحاً، وإلا يكمل كزائر (بدون رفض).
// توكن سليم التوقيع لحساب معطّل أو جلسة منتهية (كلمة مرور جديدة/إزالة جهاز) ← زائر أيضاً، كما في authGuard
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  let user;
  try {
    user = verifyAccessToken(header.slice(7));
  } catch {
    return next(); // توكن غير صالح → نتجاهله ونكمل كزائر
  }
  sessionBlock(user.sub, user.iat).then((block) => {
    if (!block) req.user = user;
    next();
  }, next);
}

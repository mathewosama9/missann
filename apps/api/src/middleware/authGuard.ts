import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/tokens.js';
import { unauthorized } from '../lib/http.js';
import { sessionBlock } from '../lib/userStatus.js';

// توكن صالح + حساب ما زال مفعّلاً + صادر بعد آخر إنهاء للجلسات (يسري فوراً رغم صلاحية التوكن 15 دقيقة)
export function authGuard(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized('توكن مفقود'));
  let user;
  try {
    user = verifyAccessToken(header.slice(7));
  } catch {
    return next(unauthorized('توكن غير صالح أو منتهٍ'));
  }
  sessionBlock(user.sub, user.iat).then(
    (block) => {
      if (block === 'inactive') return next(unauthorized('الحساب معطّل'));
      if (block === 'revoked') return next(unauthorized('انتهت الجلسة، سجّل الدخول من جديد'));
      req.user = user;
      next();
    },
    next,
  );
}

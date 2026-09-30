import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';

type Source = 'body' | 'query' | 'params';

// وسيط تحقق عام: يستبدل المصدر بالبيانات المُتحقَّقة
export const validate =
  (schema: ZodTypeAny, source: Source = 'body') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(result.error);
    if (source === 'query') Object.assign(req.query, result.data);
    else req[source] = result.data;
    next();
  };

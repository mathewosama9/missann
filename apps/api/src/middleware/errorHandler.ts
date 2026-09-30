import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/http.js';
import { logger } from '../lib/logger.js';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ message: 'المسار غير موجود' });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) fields[issue.path.join('.')] = issue.message;
    res.status(400).json({ message: 'بيانات غير صحيحة', code: 'VALIDATION', fields });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ message: err.message, code: err.code, fields: err.fields });
    return;
  }
  // انتهاء مهلة معاملة / تعارض كتابة أو deadlock: لم يُطبَّق شيء (rollback) ← آمن للإعادة
  if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === 'P2028' || err.code === 'P2034')) {
    logger.warn({ code: err.code }, 'معاملة ملغاة بسبب التزاحم');
    res.status(503).json({ message: 'الخادم مشغول الآن، حاول مرة أخرى', code: 'TX_BUSY' });
    return;
  }
  logger.error({ err }, 'خطأ غير متوقع');
  res.status(500).json({ message: 'حدث خطأ في الخادم', code: 'INTERNAL' });
}

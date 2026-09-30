import type { Request, Response, NextFunction } from 'express';

// خطأ تطبيقي بحالة HTTP
export class AppError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string>;
  constructor(status: number, message: string, code?: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (m: string, fields?: Record<string, string>) =>
  new AppError(400, m, 'BAD_REQUEST', fields);
export const unauthorized = (m = 'غير مصرّح') => new AppError(401, m, 'UNAUTHORIZED');
export const forbidden = (m = 'ليس لديك صلاحية') => new AppError(403, m, 'FORBIDDEN');
export const notFound = (m = 'غير موجود') => new AppError(404, m, 'NOT_FOUND');
export const conflict = (m: string) => new AppError(409, m, 'CONFLICT');
export const tooMany = (m = 'محاولات كثيرة، حاول لاحقاً') => new AppError(429, m, 'TOO_MANY');

// تغليف الدوال غير المتزامنة لتمرير الأخطاء لـ errorHandler
type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;
export const asyncHandler =
  (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export function paginate<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

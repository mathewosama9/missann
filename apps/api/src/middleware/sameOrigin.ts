import type { Request, Response, NextFunction } from 'express';
import { env } from '../lib/env.js';
import { forbidden } from '../lib/http.js';

const appOrigin = new URL(env.APP_URL).origin;

// ── حماية CSRF للمسارات التي تعتمد على كوكي التحديث وحده (لا ترويسة Authorization) ──
// SameSite=Lax يمنع إرسال الكوكي مع POST من موقع آخر؛ هذا خط ثانٍ: المتصفح يعلن مصدر الطلب
// (Sec-Fetch-Site / Origin) ← طلب من موقع آخر يُرفض. أدوات بلا متصفح لا ترسلهما ولا تملك الكوكي أصلاً.
export function sameOriginOnly(req: Request, _res: Response, next: NextFunction): void {
  if (req.get('sec-fetch-site') === 'cross-site') return next(forbidden('طلب من موقع آخر'));
  const origin = req.get('origin');
  if (origin && origin !== appOrigin) return next(forbidden('طلب من موقع آخر'));
  next();
}

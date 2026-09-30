import type { Response } from 'express';
import { env, isProd } from './env.js';

const REFRESH_COOKIE = 'ma_rt';

// remember=true ← كوكي دائم يبقى بعد إغلاق المتصفح؛ false ← كوكي جلسة (بلا maxAge) يُمسح بإغلاقه
export function setRefreshCookie(res: Response, token: string, remember: boolean): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    domain: env.COOKIE_DOMAIN,
    path: '/api/auth',
    ...(remember && { maxAge: env.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000 }),
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth', domain: env.COOKIE_DOMAIN });
}

export { REFRESH_COOKIE };

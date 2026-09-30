import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import type { JwtPayload } from '@miss-ann/shared';
import { env } from './env.js';

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: `${env.ACCESS_TTL_MIN}m` });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as JwtPayload;
}

// توكن التحديث: قيمة عشوائية طويلة تُخزَّن مجزّأة في قاعدة البيانات
export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

// جلسة بلا "تذكّرني": صلاحية قصيرة في الخادم أيضاً (لو تسرّب الكوكي لا يبقى صالحاً 30 يوماً)
const SESSION_TTL_HOURS = 24;

export const refreshExpiry = (remember = true): Date =>
  new Date(Date.now() + (remember ? env.REFRESH_TTL_DAYS * 24 : SESSION_TTL_HOURS) * 60 * 60 * 1000);

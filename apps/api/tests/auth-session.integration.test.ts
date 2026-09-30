// "تذكّرني" وحد الأجهزة: كوكي دائم أو كوكي جلسة، التجديد يحفظ الاختيار، ونفس البصمة لا تستهلك جهازاً جديداً.
// مستخدم واحد مؤقت (رقم 0155596xxxx) يُحذف بالتتابع مع أجهزته وتوكناته وسجلاته.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import type supertestType from 'supertest';

const PHONE = '01555962001';
const PASSWORD = 'Session@123';
let app: Express;
let prisma: PrismaClient;
let request: typeof supertestType;
let userId = 0;

const refreshCookie = (res: { headers: Record<string, unknown> }) =>
  ([] as string[]).concat((res.headers['set-cookie'] as string[] | undefined) ?? []).find((c) => c.startsWith('ma_rt='))!;
const cookiePair = (c: string) => c.split(';')[0]!;

async function cleanup() {
  const u = await prisma.user.findUnique({ where: { phone: PHONE }, select: { id: true } });
  if (!u) return;
  const logins = await prisma.auditLog.findMany({ where: { action: 'LOGIN', actorId: null }, select: { id: true, meta: true } });
  await prisma.auditLog.deleteMany({ where: { id: { in: logins.filter((l) => (l.meta as { userId?: number })?.userId === u.id).map((l) => l.id) } } });
  await prisma.user.delete({ where: { id: u.id } });
}

beforeAll(async () => {
  await import('dotenv/config');
  ({ prisma } = await import('../src/lib/prisma.js'));
  const { createApp } = await import('../src/app.js');
  const { hashPassword } = await import('../src/lib/password.js');
  request = (await import('supertest')).default;
  app = createApp();
  await cleanup();
  const u = await prisma.user.create({
    data: { name: 'جلسة اختبار', phone: PHONE, parentPhone: '01000000002', passwordHash: await hashPassword(PASSWORD), isActive: true, grade: 'FOURTH_PRIMARY' },
  });
  userId = u.id;
}, 30_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const login = (fp: string, rememberMe?: boolean) =>
  request(app).post('/api/auth/login').send({ identifier: PHONE, password: PASSWORD, deviceFingerprint: fp, ...(rememberMe !== undefined && { rememberMe }) });

describe('remember me', () => {
  it('تذكّرني ← كوكي دائم 30 يوماً ويبقى دائماً بعد التجديد', async () => {
    const r = await login('gate-session-a', true);
    expect(r.status).toBe(200);
    const c = refreshCookie(r);
    expect(c).toMatch(/Max-Age=2592000/);
    expect(c).toMatch(/HttpOnly/);
    const t = await prisma.refreshToken.findFirstOrThrow({ where: { userId }, orderBy: { id: 'desc' } });
    expect(t.remember).toBe(true);
    expect(t.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 86_400_000);

    const rr = await request(app).post('/api/auth/refresh').set('Cookie', cookiePair(c));
    expect(rr.status).toBe(200);
    expect(refreshCookie(rr)).toMatch(/Max-Age=2592000/);
  });

  it('بدون تذكّرني ← كوكي جلسة (بلا Max-Age/Expires) وصلاحية 24 ساعة لا تمتد بالتجديد', async () => {
    const r = await login('gate-session-a', false);
    const c = refreshCookie(r);
    expect(c).not.toMatch(/Max-Age|Expires/);
    const t = await prisma.refreshToken.findFirstOrThrow({ where: { userId }, orderBy: { id: 'desc' } });
    expect(t.remember).toBe(false);
    const hours = (t.expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23);
    expect(hours).toBeLessThanOrEqual(24);

    const rr = await request(app).post('/api/auth/refresh').set('Cookie', cookiePair(c));
    expect(rr.status).toBe(200);
    expect(refreshCookie(rr)).not.toMatch(/Max-Age|Expires/);
    const t2 = await prisma.refreshToken.findFirstOrThrow({ where: { userId }, orderBy: { id: 'desc' } });
    expect(t2).toMatchObject({ remember: false, expiresAt: t.expiresAt });
  });

  it('بدون الحقل أصلاً ← الافتراض الآمن: جلسة غير مُتذكَّرة', async () => {
    expect(refreshCookie(await login('gate-session-a'))).not.toMatch(/Max-Age|Expires/);
  });
});

describe('device limit', () => {
  it('نفس البصمة لا تستهلك جهازاً جديداً؛ الجهاز الثالث يُرفض 403', async () => {
    // gate-session-a مسجّل من الاختبارات السابقة (3 دخولات) ← جهاز واحد فقط
    expect(await prisma.device.count({ where: { userId } })).toBe(1);
    expect((await login('gate-session-b', true)).status).toBe(200);
    expect(await prisma.device.count({ where: { userId } })).toBe(2);
    const third = await login('gate-session-c', true);
    expect(third.status).toBe(403);
    expect(third.body.message).toContain('الأقصى للأجهزة');
  });
});

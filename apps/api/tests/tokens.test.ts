import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x';
  process.env.JWT_ACCESS_SECRET ??= 'test_access_secret_key_123456';
  process.env.JWT_REFRESH_SECRET ??= 'test_refresh_secret_key_123456';
});

describe('tokens', () => {
  it('يوقّع ويتحقق من توكن الوصول', async () => {
    const { signAccessToken, verifyAccessToken } = await import('../src/lib/tokens.js');
    const token = signAccessToken({ sub: 1, role: 'STUDENT', name: 'اختبار' });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe(1);
    expect(payload.role).toBe('STUDENT');
    expect(payload.name).toBe('اختبار');
  });

  it('يولّد توكن تحديث وهاش ثابت', async () => {
    const { generateRefreshToken, hashToken } = await import('../src/lib/tokens.js');
    const { token, hash } = generateRefreshToken();
    expect(token).toHaveLength(96);
    expect(hashToken(token)).toBe(hash);
  });
});

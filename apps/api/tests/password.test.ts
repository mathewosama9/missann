import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/lib/password.js';

describe('password', () => {
  it('يجزّئ ويتحقق من كلمة المرور', async () => {
    const hash = await hashPassword('mypass1234');
    expect(hash).toMatch(/^\$argon2id/);
    expect(await verifyPassword(hash, 'mypass1234')).toBe(true);
    expect(await verifyPassword(hash, 'wrongpass')).toBe(false);
  });
});

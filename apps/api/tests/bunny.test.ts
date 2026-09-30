import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x';
  process.env.JWT_ACCESS_SECRET ??= 'test_access_secret_key_123456';
  process.env.JWT_REFRESH_SECRET ??= 'test_refresh_secret_key_123456';
  process.env.BUNNY_STREAM_LIBRARY_ID = '12345';
  process.env.BUNNY_TOKEN_KEY = 'test-token-key';
  process.env.BUNNY_STREAM_API_KEY = 'test-api-key';
  process.env.BUNNY_TOKEN_TTL_SEC = '3600';
});

const VIDEO = '6f1a2b3c-aaaa-bbbb-cccc-1234567890ab';

describe('bunny', () => {
  it('يوقّع التوكن بصيغة Bunny: SHA256(key + videoId + expires)', async () => {
    const { signPlaybackToken } = await import('../src/lib/bunny.js');
    const expected = crypto.createHash('sha256').update(`k${VIDEO}1700000000`).digest('hex');
    expect(signPlaybackToken(VIDEO, 1700000000, 'k')).toBe(expected);
  });

  it('يبني رابط iframe موقّعاً ينتهي بعد المدة المحددة', async () => {
    const { buildSignedEmbedUrl, verifyPlaybackToken } = await import('../src/lib/bunny.js');
    const now = Date.UTC(2026, 0, 1);
    const { embedUrl, expiresAt } = buildSignedEmbedUrl(VIDEO, now);
    const url = new URL(embedUrl);

    expect(url.origin).toBe('https://iframe.mediadelivery.net');
    expect(url.pathname).toBe(`/embed/12345/${VIDEO}`);
    expect(expiresAt.getTime()).toBe(now + 3600 * 1000);
    // المفتاح السري لا يظهر في الرابط
    expect(embedUrl).not.toContain('test-token-key');

    const token = url.searchParams.get('token')!;
    const expires = Number(url.searchParams.get('expires'));
    const nowSec = now / 1000;
    expect(verifyPlaybackToken(VIDEO, expires, token, 'test-token-key', nowSec)).toBe(true);
    // بعد انتهاء المدة يُرفض
    expect(verifyPlaybackToken(VIDEO, expires, token, 'test-token-key', expires)).toBe(false);
    // لا يصلح لفيديو آخر أو بانتهاء معدّل
    expect(verifyPlaybackToken('other', expires, token, 'test-token-key', nowSec)).toBe(false);
    expect(verifyPlaybackToken(VIDEO, expires + 3600, token, 'test-token-key', nowSec)).toBe(false);
  });

  it('يوقّع رفع TUS بصيغة Bunny: SHA256(lib + apiKey + expire + videoId)', async () => {
    const { signTusUpload } = await import('../src/lib/bunny.js');
    const { headers } = signTusUpload(VIDEO, 600);
    const expected = crypto
      .createHash('sha256')
      .update(`12345test-api-key${headers.AuthorizationExpire}${VIDEO}`)
      .digest('hex');
    expect(headers.AuthorizationSignature).toBe(expected);
    expect(headers.LibraryId).toBe('12345');
    expect(JSON.stringify(headers)).not.toContain('test-api-key');
  });
});

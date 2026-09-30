import { describe, it, expect, beforeAll } from 'vitest';
import { parseYouTubeId, decodeVideoKey, lessonCreateSchema } from '@miss-ann/shared';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x';
  process.env.JWT_ACCESS_SECRET ??= 'test_access_secret_key_123456';
  process.env.JWT_REFRESH_SECRET ??= 'test_refresh_secret_key_123456';
});

const ID = 'dQw4w9WgXcQ';

describe('youtube', () => {
  it('يستخرج المعرّف من كل صيغ الروابط الشائعة', () => {
    const inputs = [
      ID,
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}&t=42s&list=abc`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}?si=xyz`,
      `youtu.be/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube-nocookie.com/embed/${ID}?rel=0`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/live/${ID}`,
    ];
    for (const i of inputs) expect(parseYouTubeId(i), i).toBe(ID);
  });

  it('يرفض الروابط غير الصالحة أو من مواقع أخرى', () => {
    for (const bad of ['', 'abc', 'https://vimeo.com/123', `https://evil.com/watch?v=${ID}`, 'https://youtube.com/watch?v=short']) {
      expect(parseYouTubeId(bad), bad).toBeNull();
    }
  });

  it('schema الحصة يحوّل الرابط إلى معرّف ويرفض الخاطئ', () => {
    const ok = lessonCreateSchema.parse({ title: 'حصة', youtubeVideoId: `https://youtu.be/${ID}` });
    expect(ok.youtubeVideoId).toBe(ID);
    expect(lessonCreateSchema.safeParse({ title: 'حصة', youtubeVideoId: 'https://vimeo.com/1' }).success).toBe(false);
  });

  it('يخفي المعرّف بمفتاح مختلف كل مرة ويُفك بشكل صحيح', async () => {
    const { createYouTubeVideoKey } = await import('../src/lib/youtube.js');
    const a = createYouTubeVideoKey(ID);
    const b = createYouTubeVideoKey(ID);
    expect(a.v).not.toBe(b.v);
    expect(JSON.stringify(a)).not.toContain(ID);
    expect(decodeVideoKey(a)).toBe(ID);
    expect(decodeVideoKey(b)).toBe(ID);
  });
});

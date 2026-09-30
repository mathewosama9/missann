// اختبارات وحدة للتخزين الخاص: القرص المحلي (مجلد مؤقت) و Bunny Storage (fetch مُزيَّف — بلا مفاتيح حقيقية)
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';

let LocalDiskStorage: typeof import('../src/lib/storage.js').LocalDiskStorage;
let BunnyStorage: typeof import('../src/lib/storage.js').BunnyStorage;
let newStorageKey: typeof import('../src/lib/storage.js').newStorageKey;

const readAll = async (s: Readable) => {
  const chunks: Buffer[] = [];
  for await (const c of s) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
};

// مفاتيح خارج الشكل الصارم ← تُرفض قبل أي وصول للقرص أو الشبكة
const BAD_KEYS = [
  '../secret.pdf',
  'submissions/../../etc/passwd',
  'submissions/abc.pdf',
  'uploads/' + 'a'.repeat(32) + '.pdf',
  'submissions/' + 'a'.repeat(32) + '.exe',
  'submissions\\' + 'a'.repeat(32) + '.pdf',
  '/submissions/' + 'a'.repeat(32) + '.pdf',
];

beforeAll(async () => {
  await import('dotenv/config');
  ({ LocalDiskStorage, BunnyStorage, newStorageKey } = await import('../src/lib/storage.js'));
});

describe('LocalDiskStorage', () => {
  let root = '';
  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-storage-'));
  });
  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('put/open/remove بمفتاح صالح؛ الكتابة لا تستبدل ملفاً موجوداً', async () => {
    const s = new LocalDiskStorage(root);
    const key = newStorageKey('submissions', 'pdf');
    expect(key).toMatch(/^submissions\/[a-f0-9]{32}\.pdf$/);
    await s.put(key, Buffer.from('%PDF-1.4 hello'));
    await expect(s.put(key, Buffer.from('x'))).rejects.toThrow();
    const obj = await s.open(key);
    expect(obj?.size).toBe(14);
    expect((await readAll(obj!.stream)).toString()).toBe('%PDF-1.4 hello');
    await s.remove(key);
    expect(await s.open(key)).toBeNull();
    await expect(s.remove(key)).resolves.toBeUndefined();
  });

  it('يرفض مفاتيح path traversal وأي شكل غير متوقع', async () => {
    const s = new LocalDiskStorage(root);
    for (const k of BAD_KEYS) {
      await expect(s.put(k, Buffer.from('x')), k).rejects.toThrow('invalid storage key');
      await expect(s.open(k), k).rejects.toThrow('invalid storage key');
    }
  });
});

describe('BunnyStorage (fetch مُزيَّف)', () => {
  const key = 'homework/' + 'b'.repeat(32) + '.webp';
  const url = `https://storage.example.net/my-zone/private/${key}`;
  const make = () => new BunnyStorage('storage.example.net', 'my-zone', 'secret-key');
  afterEach(() => vi.unstubAllGlobals());

  it('put: PUT على مسار private بمفتاح AccessKey', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await make().put(key, Buffer.from('img'));
    const [calledUrl, init] = fetchMock.mock.calls[0]!;
    expect(calledUrl).toBe(url);
    expect(init.method).toBe('PUT');
    expect(init.headers).toMatchObject({ AccessKey: 'secret-key', 'Content-Type': 'application/octet-stream' });
    expect(Buffer.from(init.body as Uint8Array).toString()).toBe('img');
  });

  it('put يرمي عند فشل Bunny', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 401 })));
    await expect(make().put(key, Buffer.from('x'))).rejects.toThrow('401');
  });

  it('open: 200 ← stream + الحجم، 404 ← null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('file-bytes', { status: 200, headers: { 'content-length': '10' } })),
    );
    const obj = await make().open(key);
    expect(obj?.size).toBe(10);
    expect((await readAll(obj!.stream)).toString()).toBe('file-bytes');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    expect(await make().open(key)).toBeNull();
  });

  it('remove: 404 مقبول، وخطأ آخر يُرمى', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(make().remove(key)).resolves.toBeUndefined();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    await expect(make().remove(key)).rejects.toThrow('500');
  });

  it('المفاتيح غير الصالحة تُرفض قبل أي طلب شبكة', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    for (const k of BAD_KEYS) await expect(make().open(k), k).rejects.toThrow('invalid storage key');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

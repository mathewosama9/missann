import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { env } from './env.js';
import { logger } from './logger.js';

// ── تخزين الملفات الخاصة (حلول الطلاب ومرفقات الواجبات) ─────────────
// لا يُقدَّم أي ملف هنا عبر مسار عام: القراءة فقط عبر endpoints مصادَقة تفحص الملكية/الاشتراك.
// الواجهة واحدة والتنفيذ يُختار من البيئة: Bunny Storage عند توفّر مفاتيحه، وإلا قرص محلي خاص.

export interface StoredObject {
  stream: Readable;
  size: number;
}

export interface FileStorage {
  put(key: string, data: Buffer): Promise<void>;
  open(key: string): Promise<StoredObject | null>;
  remove(key: string): Promise<void>;
}

export type StorageFolder = 'submissions' | 'homework';
export type StoredExt = 'pdf' | 'webp';

// المفتاح يُولَّد في الخادم فقط؛ الشكل الصارم يمنع path traversal حتى لو تلوّثت قيمة في القاعدة
const KEY_RE = /^(submissions|homework)\/[a-f0-9]{32}\.(pdf|webp)$/;

export const newStorageKey = (folder: StorageFolder, ext: StoredExt): string =>
  `${folder}/${crypto.randomBytes(16).toString('hex')}.${ext}`;

function assertKey(key: string): void {
  if (!KEY_RE.test(key)) throw new Error('invalid storage key');
}

export class LocalDiskStorage implements FileStorage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    assertKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error('invalid storage key');
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, data, { flag: 'wx' });
  }

  async open(key: string): Promise<StoredObject | null> {
    const full = this.resolve(key);
    try {
      const st = await fsp.stat(full);
      if (!st.isFile()) return null;
      return { stream: fs.createReadStream(full), size: st.size };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await fsp.unlink(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}

// Bunny Storage API (وليس Pull Zone العامة): القراءة تمرّ عبر الـ API بعد فحص الصلاحية
export class BunnyStorage implements FileStorage {
  private readonly base: string;
  constructor(host: string, zone: string, private readonly accessKey: string) {
    this.base = `https://${host}/${encodeURIComponent(zone)}/private/`;
  }

  private req(key: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
    assertKey(key);
    return fetch(this.base + key, {
      ...init,
      headers: { AccessKey: this.accessKey, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
    });
  }

  async put(key: string, data: Buffer): Promise<void> {
    const res = await this.req(key, {
      method: 'PUT',
      body: new Uint8Array(data),
      headers: { 'Content-Type': 'application/octet-stream' },
      timeoutMs: 120_000,
    });
    if (!res.ok) throw new Error(`bunny storage put failed: ${res.status}`);
  }

  async open(key: string): Promise<StoredObject | null> {
    const res = await this.req(key);
    if (res.status === 404) return null;
    if (!res.ok || !res.body) throw new Error(`bunny storage get failed: ${res.status}`);
    return {
      stream: Readable.fromWeb(res.body as unknown as WebReadableStream),
      size: Number(res.headers.get('content-length') ?? 0),
    };
  }

  async remove(key: string): Promise<void> {
    const res = await this.req(key, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`bunny storage delete failed: ${res.status}`);
  }
}

export const privateStorage: FileStorage =
  env.BUNNY_STORAGE_ZONE && env.BUNNY_STORAGE_KEY
    ? new BunnyStorage(env.BUNNY_STORAGE_HOST, env.BUNNY_STORAGE_ZONE, env.BUNNY_STORAGE_KEY)
    : new LocalDiskStorage(path.resolve(env.PRIVATE_UPLOAD_DIR));

// حذف بعد نجاح العملية الأساسية: فشله لا يُفشل الطلب (ملف يتيم أهون من فقد عمل الطالب)
export async function removeQuietly(key: string | null | undefined): Promise<void> {
  if (!key) return;
  await privateStorage.remove(key).catch((err) => logger.warn({ err: (err as Error).message, key }, 'تعذّر حذف ملف خاص'));
}

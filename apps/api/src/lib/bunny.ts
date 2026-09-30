import crypto from 'node:crypto';
import { env } from './env.js';
import { AppError } from './http.js';

// تكامل Bunny.net Stream: روابط تشغيل موقّعة + إنشاء فيديو + توقيع رفع TUS.
// كل المفاتيح من env فقط ولا تصل للعميل أبداً (يصل له التوقيع والانتهاء فقط).

const EMBED_HOST = 'https://iframe.mediadelivery.net';
const API_HOST = 'https://video.bunnycdn.com';
export const TUS_ENDPOINT = `${API_HOST}/tusupload`;

const sha256 = (input: string): string => crypto.createHash('sha256').update(input).digest('hex');

// ── توكن التشغيل ────────────────────────────────────────────────
// صيغة Bunny Embed Token Authentication: SHA256_HEX(tokenKey + videoId + expires)
export function signPlaybackToken(
  videoId: string,
  expiresUnix: number,
  tokenKey: string,
): string {
  return sha256(tokenKey + videoId + String(expiresUnix));
}

// تحقق محلي (للاختبارات/الفحص): التوقيع صحيح ولم ينتهِ
export function verifyPlaybackToken(
  videoId: string,
  expiresUnix: number,
  token: string,
  tokenKey: string,
  nowUnix = Math.floor(Date.now() / 1000),
): boolean {
  if (expiresUnix <= nowUnix) return false;
  const expected = Buffer.from(signPlaybackToken(videoId, expiresUnix, tokenKey), 'hex');
  const given = Buffer.from(token, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export interface SignedEmbed {
  embedUrl: string;
  expiresAt: Date;
}

// رابط iframe موقّع قصير العمر لحصة واحدة
export function buildSignedEmbedUrl(videoId: string, now = Date.now()): SignedEmbed {
  assertConfigured(env.BUNNY_STREAM_LIBRARY_ID && env.BUNNY_TOKEN_KEY);
  const expires = Math.floor(now / 1000) + env.BUNNY_TOKEN_TTL_SEC;
  const token = signPlaybackToken(videoId, expires, env.BUNNY_TOKEN_KEY);

  const url = new URL(`${EMBED_HOST}/embed/${env.BUNNY_STREAM_LIBRARY_ID}/${encodeURIComponent(videoId)}`);
  url.searchParams.set('token', token);
  url.searchParams.set('expires', String(expires));
  url.searchParams.set('autoplay', 'false');
  url.searchParams.set('preload', 'true');
  url.searchParams.set('responsive', 'true');
  return { embedUrl: url.toString(), expiresAt: new Date(expires * 1000) };
}

// ── إدارة المكتبة (أدمن) ────────────────────────────────────────
export async function createBunnyVideo(title: string): Promise<{ videoId: string }> {
  assertConfigured(env.BUNNY_STREAM_LIBRARY_ID && env.BUNNY_STREAM_API_KEY);
  const res = await bunnyFetch(`/library/${env.BUNNY_STREAM_LIBRARY_ID}/videos`, {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
  const data = (await res.json()) as { guid?: string };
  if (!data.guid) throw new AppError(502, 'استجابة غير متوقعة من Bunny', 'BUNNY_ERROR');
  return { videoId: data.guid };
}

export interface BunnyVideoInfo {
  status: number; // 0 created,1 uploaded,2 processing,3 transcoding,4 finished,5 error
  encodeProgress: number;
  lengthSec: number;
}

export async function getBunnyVideo(videoId: string): Promise<BunnyVideoInfo> {
  assertConfigured(env.BUNNY_STREAM_LIBRARY_ID && env.BUNNY_STREAM_API_KEY);
  const res = await bunnyFetch(
    `/library/${env.BUNNY_STREAM_LIBRARY_ID}/videos/${encodeURIComponent(videoId)}`,
    { method: 'GET' },
  );
  const data = (await res.json()) as { status?: number; encodeProgress?: number; length?: number };
  return {
    status: data.status ?? 0,
    encodeProgress: data.encodeProgress ?? 0,
    lengthSec: Math.round(data.length ?? 0),
  };
}

// توقيع رفع TUS مباشر من المتصفح: SHA256(libraryId + apiKey + expire + videoId)
export function signTusUpload(videoId: string, ttlSec = 2 * 60 * 60) {
  assertConfigured(env.BUNNY_STREAM_LIBRARY_ID && env.BUNNY_STREAM_API_KEY);
  const expire = Math.floor(Date.now() / 1000) + ttlSec;
  const signature = sha256(
    env.BUNNY_STREAM_LIBRARY_ID + env.BUNNY_STREAM_API_KEY + String(expire) + videoId,
  );
  return {
    headers: {
      AuthorizationSignature: signature,
      AuthorizationExpire: String(expire),
      VideoId: videoId,
      LibraryId: env.BUNNY_STREAM_LIBRARY_ID,
    },
    expiresAt: new Date(expire * 1000),
  };
}

// ── أدوات داخلية ────────────────────────────────────────────────
function assertConfigured(ok: unknown): void {
  if (!ok) throw new AppError(503, 'خدمة الفيديو غير مهيّأة بعد', 'VIDEO_UNCONFIGURED');
}

async function bunnyFetch(path: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_HOST}${path}`, {
      ...init,
      headers: {
        AccessKey: env.BUNNY_STREAM_API_KEY,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError(502, 'تعذّر الاتصال بخدمة الفيديو', 'BUNNY_UNREACHABLE');
  }
  if (res.status === 404) throw new AppError(404, 'الفيديو غير موجود في مكتبة Bunny', 'NOT_FOUND');
  if (!res.ok) throw new AppError(502, `خطأ من خدمة الفيديو (${res.status})`, 'BUNNY_ERROR');
  return res;
}

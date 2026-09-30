import crypto from 'node:crypto';
import { encodeVideoKey, type VideoKey } from '@miss-ann/shared';
import { badRequest, notFound } from './http.js';
import { logger } from './logger.js';

// تكامل يوتيوب: فحص قابلية التضمين عند الحفظ + إخفاء المعرّف في استجابة التشغيل.
// يوتيوب لا يدعم روابط موقّعة، لذا الحماية: فيديو "غير مدرج" + بوابة اشتراك +
// مشغّل مخصّص يحجب واجهة يوتيوب + علامة مائية.

// مفتاح عشوائي جديد لكل طلب تشغيل
export function createYouTubeVideoKey(videoId: string): VideoKey {
  return encodeVideoKey(videoId, new Uint8Array(crypto.randomBytes(16)));
}

// oEmbed: 200 = عام/غير مدرج وقابل للتضمين · 401/403 = خاص أو التضمين معطّل · 404/400 = غير موجود
export async function assertYouTubeEmbeddable(videoId: string): Promise<void> {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`,
  )}`;
  let status: number;
  try {
    status = (await fetch(url, { signal: AbortSignal.timeout(8_000) })).status;
  } catch (err) {
    // لا نمنع الحفظ إن تعذّر الوصول ليوتيوب مؤقتاً
    logger.warn({ err, videoId }, 'تعذّر فحص فيديو يوتيوب');
    return;
  }
  if (status === 200) return;
  if (status === 401 || status === 403) {
    throw badRequest(
      'الفيديو خاص أو التضمين معطّل — اجعله "غير مدرج" (Unlisted) وفعّل "السماح بالتضمين" من YouTube Studio',
    );
  }
  if (status === 404 || status === 400) throw notFound('فيديو يوتيوب غير موجود');
  logger.warn({ status, videoId }, 'استجابة غير متوقعة من oEmbed');
}

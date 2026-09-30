import type { BunnyUploadDTO } from '@miss-ann/shared';

// رافع TUS مبسّط لـ Bunny Stream: رفع مباشر من المتصفح بتوقيع مؤقت من الخادم
// (مفتاح API لا يصل للمتصفح). يرفع على أجزاء لتحمّل الملفات الكبيرة.
const CHUNK_SIZE = 8 * 1024 * 1024;

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

// أخطاء الشبكة تظهر برسالة عربية؛ الإلغاء يمر كما هو (AbortError)
async function send(url: string, init: RequestInit, failMessage: string): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new Error(failMessage);
  }
}

export async function tusUpload(
  file: File,
  upload: BunnyUploadDTO,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const auth = { ...upload.headers, 'Tus-Resumable': '1.0.0' };

  // 1) إنشاء جلسة الرفع
  const create = await send(
    upload.tusEndpoint,
    {
      method: 'POST',
      signal,
      headers: {
        ...auth,
        'Upload-Length': String(file.size),
        'Upload-Metadata': `filetype ${b64(file.type || 'video/mp4')},title ${b64(file.name)}`,
      },
    },
    'تعذّر الاتصال بـ Bunny لبدء الرفع',
  );
  const location = create.headers.get('Location');
  if (!create.ok || !location) throw new Error('تعذّر بدء الرفع إلى Bunny');
  const uploadUrl = new URL(location, upload.tusEndpoint).toString();

  // 2) إرسال الأجزاء بالتتابع
  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + CHUNK_SIZE);
    const res = await send(
      uploadUrl,
      {
        method: 'PATCH',
        signal,
        headers: {
          ...auth,
          'Upload-Offset': String(offset),
          'Content-Type': 'application/offset+octet-stream',
        },
        body: chunk,
      },
      'انقطع الاتصال أثناء الرفع، حاول مرة أخرى',
    );
    if (!res.ok) throw new Error('انقطع الرفع، حاول مرة أخرى');
    const next = Number(res.headers.get('Upload-Offset'));
    offset = Number.isFinite(next) && next > offset ? next : offset + chunk.size;
    onProgress(Math.min(100, Math.round((offset / file.size) * 100)));
  }
}

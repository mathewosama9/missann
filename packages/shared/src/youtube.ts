// أدوات يوتيوب المشتركة بين الـ API والواجهة

export const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

// يستخرج معرّف الفيديو من أي صيغة رابط شائعة أو من المعرّف نفسه
// youtu.be/ID · youtube.com/watch?v=ID · /embed/ID · /shorts/ID · /live/ID · youtube-nocookie.com/embed/ID
export function parseYouTubeId(input: string): string | null {
  const value = input.trim();
  if (YOUTUBE_ID_RE.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value.includes('://') ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;

  if (host === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      id = m?.[1] ?? null;
    }
  }
  return id && YOUTUBE_ID_RE.test(id) ? id : null;
}

// ── إخفاء معرّف الفيديو في استجابة /play ────────────────────────
// ليس تشفيراً حقيقياً: يمنع النسخ العابر للمعرّف من أدوات المطوّر أو من الـ JSON.
// المعرّف يظهر حتماً داخل iframe يوتيوب نفسه، والحماية الحقيقية هي بوابة الاشتراك والعلامة المائية.
export interface VideoKey {
  k: string; // مفتاح عشوائي لكل طلب (base64)
  v: string; // المعرّف بعد XOR (base64)
}

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function encodeVideoKey(id: string, nonce: Uint8Array): VideoKey {
  const data = new TextEncoder().encode(id);
  const out = data.map((b, i) => b ^ nonce[i % nonce.length]!);
  return { k: toB64(nonce), v: toB64(out) };
}

export function decodeVideoKey(key: VideoKey): string {
  const nonce = fromB64(key.k);
  const data = fromB64(key.v).map((b, i) => b ^ nonce[i % nonce.length]!);
  return new TextDecoder().decode(data);
}

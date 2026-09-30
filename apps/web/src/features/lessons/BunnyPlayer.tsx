import { useEffect, useRef } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { Watermark, CaptureCover, useWrapperFullscreen, type PlayerTime } from './Watermark';
import type { GuardReason } from './useCaptureGuard';

// مشغّل Bunny Stream المحمي:
// - iframe برابط موقّع قصير العمر (يصدره الخادم)
// - علامة مائية متحرّكة + ملء الشاشة على الغلاف حتى تبقى ظاهرة
// - تعطيل قائمة الزر الأيمن والسحب
// - تتبّع الوقت عبر بروتوكول player.js (postMessage) الذي يدعمه مشغّل Bunny

const BUNNY_ORIGIN = 'https://iframe.mediadelivery.net';

export interface PlayerCallbacks {
  watermarkText: string;
  // سبب الحجب من طبقة الردع (null = مسموح بالعرض)
  guard?: GuardReason | null;
  startAt?: number;
  onTimeUpdate?: (t: PlayerTime) => void;
  onPause?: () => void;
  onEnded?: () => void;
}

interface PlayerJsMessage {
  context?: string;
  event?: string;
  value?: unknown;
}

export function BunnyPlayer({
  embedUrl,
  watermarkText,
  startAt = 0,
  onTimeUpdate,
  onPause,
  onEnded,
  guard = null,
}: PlayerCallbacks & { embedUrl: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const { fullscreen, toggle } = useWrapperFullscreen(wrapRef);

  // الـ callbacks في ref حتى لا يُعاد تسجيل مستمع الرسائل مع كل render
  const handlers = useRef({ onTimeUpdate, onPause, onEnded, startAt, guard });
  handlers.current = { onTimeUpdate, onPause, onEnded, startAt, guard };

  const post = (method: string, value?: unknown) =>
    frameRef.current?.contentWindow?.postMessage(
      JSON.stringify({ context: 'player.js', version: '0.0.11', method, value, listener: method }),
      BUNNY_ORIGIN,
    );

  // الحجب يوقف التشغيل فوراً
  useEffect(() => {
    if (guard) post('pause');
  }, [guard]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== BUNNY_ORIGIN || e.source !== frameRef.current?.contentWindow) return;
      let msg: PlayerJsMessage;
      try {
        msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (msg?.context !== 'player.js') return;

      const h = handlers.current;
      switch (msg.event) {
        case 'ready':
          for (const ev of ['timeupdate', 'play', 'pause', 'ended']) post('addEventListener', ev);
          if (h.startAt > 5) post('setCurrentTime', h.startAt);
          break;
        case 'timeupdate': {
          const v = msg.value as Partial<PlayerTime> | undefined;
          if (v && typeof v.seconds === 'number' && typeof v.duration === 'number') {
            h.onTimeUpdate?.({ seconds: v.seconds, duration: v.duration });
          }
          break;
        }
        case 'play':
          // تشغيل من داخل الـ iframe (لوحة المفاتيح مثلاً) أثناء الحجب ← يُرفض
          if (h.guard) post('pause');
          break;
        case 'pause':
          h.onPause?.();
          break;
        case 'ended':
          h.onEnded?.();
          break;
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [embedUrl]);

  return (
    <div
      ref={wrapRef}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      className={`group relative select-none overflow-hidden bg-ink-900 ${
        fullscreen ? 'h-full w-full' : 'aspect-video w-full rounded-3xl'
      }`}
    >
      <iframe
        ref={frameRef}
        src={embedUrl}
        title="مشغّل الحصة"
        className="absolute inset-0 h-full w-full border-0"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
      />

      <Watermark text={watermarkText} />
      {guard && <CaptureCover reason={guard} />}

      <button
        type="button"
        onClick={toggle}
        className="absolute left-3 top-3 z-30 grid h-9 w-9 place-items-center rounded-full bg-ink-900/60 text-white transition hover:bg-ink-900/80 focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"
        aria-label={fullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
        title={fullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
      >
        {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
      </button>
    </div>
  );
}

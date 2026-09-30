import { useEffect, useState } from 'react';

const MOVE_EVERY_MS = 7000;
const randomSpot = () => ({ top: 8 + Math.random() * 72, left: 6 + Math.random() * 64 });

// علامة مائية شخصية تتحرّك دورياً فوق الفيديو (لا تستقبل النقرات)
export function Watermark({ text }: { text: string }) {
  const [spot, setSpot] = useState(randomSpot);

  useEffect(() => {
    const t = window.setInterval(() => setSpot(randomSpot()), MOVE_EVERY_MS);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-20 whitespace-nowrap rounded-full bg-ink-900/25 px-3 py-1 text-xs font-semibold text-white/70 transition-all duration-[1500ms] ease-in-out sm:text-sm"
      style={{ top: `${spot.top}%`, left: `${spot.left}%`, textShadow: '0 1px 2px rgba(0,0,0,.6)' }}
    >
      {text}
    </div>
  );
}

export interface PlayerTime {
  seconds: number;
  duration: number;
}

// ملء الشاشة على الغلاف (لا على الـ iframe) حتى تبقى العلامة المائية ظاهرة
export function useWrapperFullscreen(ref: React.RefObject<HTMLElement>) {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [ref]);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void ref.current?.requestFullscreen?.();
  };
  return { fullscreen, toggle };
}

// غطاء كامل يُخفي الفيديو عند محاولة التصوير أو ترك الصفحة
export function CaptureCover({ reason }: { reason: 'away' | 'capture' }) {
  return (
    <div className="absolute inset-0 z-[60] grid place-items-center bg-ink-900 px-6 text-center text-paper">
      <div>
        <p className="font-display text-xl font-extrabold">
          {reason === 'capture' ? 'التصوير غير مسموح أثناء الحصة' : 'تم إيقاف الحصة مؤقتاً'}
        </p>
        <p className="mt-2 text-sm text-paper/70">
          {reason === 'capture'
            ? 'المحتوى محمي وعليه بياناتك الشخصية.'
            : 'ارجع لصفحة الحصة ثم اضغط تشغيل للمتابعة.'}
        </p>
      </div>
    </div>
  );
}

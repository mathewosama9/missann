import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { decodeVideoKey, type VideoKey } from '@miss-ann/shared';
import { Watermark, CaptureCover, useWrapperFullscreen } from './Watermark';
import type { PlayerCallbacks } from './BunnyPlayer';

// مشغّل يوتيوب "مغلّف" بأقصى حماية ممكنة من جهة الواجهة:
// 1) الفيديو "غير مدرج" على يوتيوب، والمعرّف لا يصل إلا للمشترك (مُخفى) ويُفك هنا فقط
// 2) youtube-nocookie + بدون أدوات يوتيوب (controls=0) وبدون اختصارات لوحة المفاتيح
// 3) الـ iframe لا يستقبل أي نقرة (pointer-events: none) ← لا شعار، لا عنوان، لا "مشاهدة على يوتيوب"،
//    لا نسخ رابط، لا قائمة زر أيمن من يوتيوب
// 4) الـ iframe أطول من الإطار بـ 40% ومقصوص ← شريط العنوان والشعار خارج المنطقة الظاهرة
// 5) غطاء كامل قبل البدء وعند الإيقاف والانتهاء ← يحجب الصورة المصغّرة والفيديوهات المقترحة
// 6) أدوات تحكّم خاصة بنا + علامة مائية متحرّكة + ملء الشاشة على الغلاف
// 7) بعد انتهاء الجلسة يوقف التشغيل ويطلب رابطاً جديداً (إعادة فحص الاشتراك)
// ملاحظة صريحة: المعرّف يظهر حتماً داخل طلبات iframe يوتيوب لمن يفتح أدوات المطوّر؛
// هذه الطبقات تمنع النسخ السهل وتردع التسريب لكنها لا تساوي حماية Bunny بالتوكن الموقّع.

const HOST = 'https://www.youtube-nocookie.com';
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const HIDE_CONTROLS_MS = 2500;

// ── أنواع مختصرة لـ YouTube IFrame API ───────────────────────────
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  mute(): void;
  unMute(): void;
  setVolume(v: number): void;
  setPlaybackRate(r: number): void;
  destroy(): void;
}
interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      host: string;
      videoId: string;
      width: string;
      height: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 } as const;

let apiPromise: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error('youtube api'));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

type Status = 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';

export function YouTubePlayer({
  videoKey,
  expiresAt,
  onExpired,
  watermarkText,
  startAt = 0,
  onTimeUpdate,
  onPause,
  onEnded,
  guard = null,
}: PlayerCallbacks & { videoKey: VideoKey; expiresAt: string; onExpired?: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const { fullscreen, toggle: toggleFullscreen } = useWrapperFullscreen(wrapRef);

  const [status, setStatus] = useState<Status>('loading');
  const [errorText, setErrorText] = useState('');
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [speed, setSpeed] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [expired, setExpired] = useState(false);

  // المعرّف يُفك داخل المشغّل فقط (videoKey يتغيّر شكله مع كل طلب لكن المعرّف ثابت)
  const videoId = decodeVideoKey(videoKey);

  const cb = useRef({ onTimeUpdate, onPause, onEnded, onExpired, startAt, guard });
  cb.current = { onTimeUpdate, onPause, onEnded, onExpired, startAt, guard };
  const expiresMs = useRef(Date.parse(expiresAt));
  const expiredSent = useRef(false);

  // رابط جديد من الخادم (بعد إعادة فحص الاشتراك) ← نفس المشغّل يكمل
  useEffect(() => {
    expiresMs.current = Date.parse(expiresAt);
    expiredSent.current = false;
    setExpired(false);
  }, [expiresAt]);

  // انتهاء الجلسة: طلب تجديد واحد فقط لكل جلسة
  const expire = useCallback(() => {
    playerRef.current?.pauseVideo();
    setExpired(true);
    if (expiredSent.current) return;
    expiredSent.current = true;
    cb.current.onExpired?.();
  }, []);

  // إنشاء المشغّل مرة واحدة لكل فيديو
  useEffect(() => {
    let cancelled = false;
    const host = mountRef.current;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !host) return;
        // عقدة مستقلة عن React لأن يوتيوب يستبدلها بالـ iframe
        const el = document.createElement('div');
        host.appendChild(el);
        playerRef.current = new YT.Player(el, {
          host: HOST,
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
            modestbranding: 1,
            iv_load_policy: 3,
            playsinline: 1,
            cc_load_policy: 0,
            enablejsapi: 1,
            origin: window.location.origin,
            ...(cb.current.startAt > 5 && { start: Math.floor(cb.current.startAt) }),
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              setDuration(playerRef.current?.getDuration() ?? 0);
              setStatus('ready');
            },
            onStateChange: ({ data }) => {
              if (data === STATE.PLAYING) {
                // تشغيل بدأ لحظة الحجب (طلب سابق) ← يُوقف فوراً
                if (cb.current.guard) playerRef.current?.pauseVideo();
                setStatus('playing');
              }
              else if (data === STATE.PAUSED) {
                setStatus('paused');
                cb.current.onPause?.();
              } else if (data === STATE.ENDED) {
                setStatus('ended');
                cb.current.onEnded?.();
              }
            },
            onError: ({ data }) => {
              setStatus('error');
              setErrorText(
                data === 101 || data === 150
                  ? 'صاحب الفيديو منع تشغيله خارج يوتيوب — فعّل "السماح بالتضمين"'
                  : data === 100
                    ? 'الفيديو غير متاح (محذوف أو خاص)'
                    : 'تعذّر تشغيل الفيديو، حاول تحديث الصفحة',
              );
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
          setErrorText('تعذّر تحميل مشغّل يوتيوب، تأكد من الاتصال بالإنترنت');
        }
      });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      if (host) host.innerHTML = '';
    };
  }, [videoId]);

  // قراءة الوقت أثناء التشغيل + إيقاف عند انتهاء الجلسة
  useEffect(() => {
    if (status !== 'playing') return;
    const t = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      const seconds = p.getCurrentTime();
      const d = p.getDuration();
      setCurrent(seconds);
      if (d) setDuration(d);
      cb.current.onTimeUpdate?.({ seconds, duration: d });
      if (Date.now() >= expiresMs.current) expire();
    }, 500);
    return () => window.clearInterval(t);
  }, [status, expire]);

  // الحجب (ترك الصفحة/محاولة تصوير) يوقف التشغيل فوراً
  useEffect(() => {
    if (guard) playerRef.current?.pauseVideo();
  }, [guard]);

  // إخفاء أدوات التحكم تلقائياً أثناء التشغيل
  const hideTimer = useRef<number>();
  const pokeControls = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), HIDE_CONTROLS_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  const play = () => {
    if (guard) return;
    if (Date.now() >= expiresMs.current) {
      expiredSent.current = false; // ضغطة المستخدم = محاولة تجديد جديدة (لو فشلت السابقة)
      expire();
      return;
    }
    playerRef.current?.playVideo();
    pokeControls();
  };
  const pause = () => playerRef.current?.pauseVideo();
  const togglePlay = () => (status === 'playing' ? pause() : play());

  const seek = (to: number) => {
    const d = duration || playerRef.current?.getDuration() || 0;
    const target = Math.min(Math.max(0, to), Math.max(0, d - 1));
    playerRef.current?.seekTo(target, true);
    setCurrent(target);
    pokeControls();
  };

  const restart = () => {
    playerRef.current?.seekTo(0, true);
    play();
  };

  const toggleMute = () => {
    const p = playerRef.current;
    if (!p) return;
    if (muted) p.unMute();
    else p.mute();
    setMuted(!muted);
  };

  const changeVolume = (v: number) => {
    const p = playerRef.current;
    if (!p) return;
    p.setVolume(v);
    if (v === 0) p.mute();
    else if (muted) p.unMute();
    setVolume(v);
    setMuted(v === 0);
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!;
    playerRef.current?.setPlaybackRate(next);
    setSpeed(next);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (status === 'loading' || status === 'error') return;
    const keys: Record<string, () => void> = {
      ' ': togglePlay,
      k: togglePlay,
      ArrowRight: () => seek(current + 10),
      ArrowLeft: () => seek(current - 10),
      m: toggleMute,
      f: toggleFullscreen,
    };
    const fn = keys[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };

  const covered = status !== 'playing'; // يحجب واجهة يوتيوب في كل حالة غير التشغيل
  const showControls = status !== 'loading' && status !== 'error' && status !== 'ended' && (controlsVisible || status !== 'playing');

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseMove={pokeControls}
      onTouchStart={pokeControls}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      className={`relative select-none overflow-hidden bg-ink-900 outline-none ${
        fullscreen ? 'h-full w-full' : 'aspect-video w-full rounded-3xl'
      } ${status === 'playing' && !controlsVisible ? 'cursor-none' : ''}`}
    >
      {/* iframe يوتيوب: أطول بـ 40% ومقصوص، ولا يستقبل أي تفاعل */}
      <div className="pointer-events-none absolute inset-x-0 -top-[20%] h-[140%]" aria-hidden>
        <div ref={mountRef} className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full" />
      </div>

      {/* طبقة الالتقاط: كل النقرات تذهب لمشغّلنا لا ليوتيوب */}
      <div className="absolute inset-0 z-10" onClick={togglePlay} onDoubleClick={toggleFullscreen} />

      <Watermark text={watermarkText} />
      {guard && <CaptureCover reason={guard} />}

      {/* أغطية الحالات */}
      {covered && (
        <div
          className={`absolute inset-0 z-30 grid place-items-center ${
            status === 'paused' ? 'bg-ink-900/70 backdrop-blur-md' : 'bg-ink-900'
          }`}
          onClick={status === 'paused' || status === 'ready' ? play : undefined}
        >
          {status === 'loading' && (
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-lime-300 border-t-transparent" />
          )}

          {status === 'error' && (
            <div className="max-w-sm px-6 text-center text-paper">
              <AlertTriangle size={36} className="mx-auto mb-3 text-coral-400" />
              <p className="font-semibold">{errorText}</p>
            </div>
          )}

          {(status === 'ready' || status === 'paused') && !expired && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                play();
              }}
              className="grid h-20 w-20 place-items-center rounded-full bg-lime-300 text-ink-900 shadow-stamp transition hover:scale-105"
              aria-label={status === 'paused' ? 'استكمال' : 'تشغيل'}
            >
              <Play size={34} fill="currentColor" className="translate-x-[-2px]" />
            </button>
          )}

          {expired && (
            <div className="px-6 text-center text-paper">
              <RefreshCw size={30} className="mx-auto mb-3 animate-spin text-lime-300" />
              <p className="font-semibold">جاري تجديد جلسة المشاهدة...</p>
            </div>
          )}

          {status === 'ended' && (
            <div className="text-center text-paper">
              <p className="mb-4 font-display text-2xl font-extrabold">انتهت الحصة، أحسنت!</p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  restart();
                }}
                className="btn-accent"
              >
                <RotateCcw size={18} /> إعادة المشاهدة
              </button>
            </div>
          )}
        </div>
      )}

      {/* أدوات التحكم */}
      <div
        dir="ltr"
        className={`absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-ink-900/90 to-transparent px-3 pb-3 pt-10 text-white transition-opacity duration-300 sm:px-4 ${
          showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.floor(duration))}
          step={1}
          value={Math.floor(current)}
          onChange={(e) => seek(Number(e.target.value))}
          className="mb-2 h-1.5 w-full cursor-pointer accent-lime-300"
          aria-label="موضع التشغيل"
        />
        <div className="flex items-center gap-1 sm:gap-2">
          <CtrlButton label={status === 'playing' ? 'إيقاف مؤقت' : 'تشغيل'} onClick={togglePlay}>
            {status === 'playing' ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </CtrlButton>
          <CtrlButton label="رجوع 10 ثوانٍ" onClick={() => seek(current - 10)}>
            <RotateCcw size={18} />
          </CtrlButton>
          <CtrlButton label="تقديم 10 ثوانٍ" onClick={() => seek(current + 10)}>
            <RotateCw size={18} />
          </CtrlButton>

          <span className="ml-1 tabular-nums text-xs font-semibold sm:text-sm">
            {fmt(current)} / {fmt(duration)}
          </span>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <CtrlButton label={muted ? 'تشغيل الصوت' : 'كتم الصوت'} onClick={toggleMute}>
              {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </CtrlButton>
            <input
              type="range"
              min={0}
              max={100}
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              className="hidden h-1 w-20 cursor-pointer accent-lime-300 sm:block"
              aria-label="مستوى الصوت"
            />
            <button
              type="button"
              onClick={cycleSpeed}
              className="rounded-full px-2 py-1 text-xs font-bold tabular-nums hover:bg-white/15"
              aria-label="سرعة التشغيل"
              title="سرعة التشغيل"
            >
              {speed}x
            </button>
            <CtrlButton label={fullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </CtrlButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function CtrlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15"
    >
      {children}
    </button>
  );
}

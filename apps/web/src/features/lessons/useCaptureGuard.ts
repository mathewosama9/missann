import { useEffect, useRef, useState } from 'react';

// طبقة ردع ضد التصوير أثناء المشاهدة (ليست منعاً مطلقاً — المتصفح لا يسمح بذلك):
// - الخروج من التبويب/التطبيق أو فقدان تركيز النافذة (فتح برنامج تسجيل مثلاً) ← إيقاف وتغطية الفيديو
// - زر Print Screen واختصارات التصوير الشائعة ← تغطية لحظية + محاولة مسح الحافظة
// - الطباعة (Ctrl+P) ← ممنوعة، والصفحة تُطبع فارغة
// الحماية الفعلية ضد التسريب هي العلامة المائية الشخصية.

export type GuardReason = 'away' | 'capture';

const CAPTURE_FLASH_MS = 2500;
// أثناء وجود التركيز داخل iframe المشغّل لا تصل أحداث blur للنافذة ← نفحص التركيز دورياً
const IFRAME_FOCUS_POLL_MS = 500;
// ماك: Cmd+Shift+3/4/5 · ويندوز: Win+Shift+S (e.code لأن Shift يغيّر e.key إلى #/$/%)
const CAPTURE_CODES = ['KeyS', 'Digit3', 'Digit4', 'Digit5'];

export function useCaptureGuard(enabled = true) {
  const [away, setAway] = useState(false);
  const [capture, setCapture] = useState(false);
  const flashTimer = useRef<number>();

  useEffect(() => {
    if (!enabled) return;
    let blurTimer: number | undefined;
    let pollTimer: number | undefined;

    const stopPoll = () => {
      window.clearInterval(pollTimer);
      pollTimer = undefined;
    };

    const flash = () => {
      setCapture(true);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setCapture(false), CAPTURE_FLASH_MS);
      // محاولة استبدال ما في الحافظة (قد يرفضها المتصفح بدون صلاحية — لا مشكلة)
      navigator.clipboard?.writeText(' ').catch(() => undefined);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') setAway(true);
      else if (document.hasFocus()) setAway(false);
    };

    const onBlur = () => {
      // النقر داخل iframe المشغّل (Bunny) يُفقد النافذة التركيز أيضاً ← نتجاهله،
      // لكن نراقب: hasFocus() يبقى true ما دام التركيز داخل الـ iframe، ويصبح false عند ترك النافذة
      window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        if (document.activeElement?.tagName !== 'IFRAME') {
          setAway(true);
          return;
        }
        stopPoll();
        pollTimer = window.setInterval(() => {
          if (document.activeElement?.tagName !== 'IFRAME') stopPoll();
          else if (!document.hasFocus()) {
            stopPoll();
            setAway(true);
          }
        }, IFRAME_FOCUS_POLL_MS);
      }, 0);
    };

    const onFocus = () => {
      stopPoll();
      if (document.visibilityState === 'visible') setAway(false);
    };

    const onKey = (e: KeyboardEvent) => {
      const printScreen = e.key === 'PrintScreen' || e.code === 'PrintScreen';
      const shortcut = e.shiftKey && e.metaKey && CAPTURE_CODES.includes(e.code);
      const print = (e.ctrlKey || e.metaKey) && e.code === 'KeyP';
      if (print) e.preventDefault();
      if (printScreen || shortcut || print) flash();
    };

    const onBeforePrint = () => flash();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('beforeprint', onBeforePrint);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      window.removeEventListener('beforeprint', onBeforePrint);
      window.clearTimeout(flashTimer.current);
      window.clearTimeout(blurTimer);
      stopPoll();
    };
  }, [enabled]);

  const reason: GuardReason | null = capture ? 'capture' : away ? 'away' : null;
  return { blocked: reason !== null, reason };
}

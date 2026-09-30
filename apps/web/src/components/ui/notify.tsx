import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle, Info, AlertTriangle, type LucideIcon } from 'lucide-react';

// إشعارات بشكل نافذة في منتصف الشاشة — بنفس واجهة sonner (toast.success/error/info/warning)

type Kind = 'success' | 'error' | 'info' | 'warning';

interface Notice {
  id: number;
  kind: Kind;
  message: string;
  duration: number | null; // null = يبقى حتى يغلقه المستخدم
}

interface Options {
  duration?: number;
}

const DEFAULT_DURATION: Record<Kind, number | null> = {
  success: 2200,
  info: 3500,
  warning: 4000,
  error: null,
};

const useNotice = create<{ current: Notice | null; close: () => void }>((set) => ({
  current: null,
  close: () => set({ current: null }),
}));

let seq = 0;
const show = (kind: Kind) => (message: string, opts?: Options) => {
  useNotice.setState({
    current: { id: ++seq, kind, message, duration: opts?.duration ?? DEFAULT_DURATION[kind] },
  });
};

export const toast = {
  success: show('success'),
  error: show('error'),
  info: show('info'),
  warning: show('warning'),
};

const STYLES: Record<Kind, { icon: LucideIcon; title: string; badge: string; bar: string; stamp: string }> = {
  success: { icon: CheckCircle2, title: 'تم بنجاح', badge: 'bg-lime-300 text-ink-900', bar: 'bg-lime-400', stamp: 'shadow-[6px_6px_0_0_#CDEB3C]' },
  error: { icon: XCircle, title: 'حصلت مشكلة', badge: 'bg-coral-400 text-ink-900', bar: 'bg-coral-500', stamp: 'shadow-[6px_6px_0_0_#FF835F]' },
  info: { icon: Info, title: 'تنبيه', badge: 'bg-brand-500 text-white', bar: 'bg-brand-500', stamp: 'shadow-[6px_6px_0_0_#6177FF]' },
  warning: { icon: AlertTriangle, title: 'انتبه', badge: 'bg-science-yellow text-ink-900', bar: 'bg-science-yellow', stamp: 'shadow-[6px_6px_0_0_#E8B321]' },
};

export function Notifier() {
  const current = useNotice((s) => s.current);
  const close = useNotice((s) => s.close);
  const btnRef = useRef<HTMLButtonElement>(null);

  // إغلاق تلقائي + زر Escape
  useEffect(() => {
    if (!current) return;
    btnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => (e.key === 'Escape' || e.key === 'Enter') && close();
    document.addEventListener('keydown', onKey);
    const timer = current.duration ? window.setTimeout(close, current.duration) : undefined;
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(timer);
    };
  }, [current, close]);

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.id}
          className="fixed inset-0 z-[100] grid place-items-center bg-ink-950/40 p-4 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={close}
          dir="rtl"
        >
          <NoticeCard notice={current} onClose={close} btnRef={btnRef} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function NoticeCard({
  notice,
  onClose,
  btnRef,
}: {
  notice: Notice;
  onClose: () => void;
  btnRef: React.RefObject<HTMLButtonElement>;
}) {
  const s = STYLES[notice.kind];
  const Icon = s.icon;
  return (
    <motion.div
      role={notice.kind === 'error' ? 'alertdialog' : 'status'}
      aria-live="assertive"
      aria-label={s.title}
      className={`relative w-full max-w-sm overflow-hidden rounded-3xl border-2 border-ink-900 bg-paper-50 px-6 pb-6 pt-8 text-center ${s.stamp}`}
      initial={{ scale: 0.85, y: 16, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={{ scale: 0.92, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      onClick={(e) => e.stopPropagation()}
    >
      <motion.span
        className={`mx-auto grid h-16 w-16 place-items-center rounded-full border-2 border-ink-900 ${s.badge}`}
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 16, delay: 0.08 }}
      >
        <Icon size={30} strokeWidth={2.2} />
      </motion.span>

      <h2 className="mt-4 font-display text-2xl font-extrabold text-ink-900">{s.title}</h2>
      <p className="mt-1.5 leading-7 text-ink-600">{notice.message}</p>

      <button ref={btnRef} type="button" onClick={onClose} className="btn-dark mt-6 w-full py-3">
        تمام
      </button>

      {notice.duration && (
        <motion.span
          className={`absolute bottom-0 right-0 h-1 ${s.bar}`}
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: notice.duration / 1000, ease: 'linear' }}
        />
      )}
    </motion.div>
  );
}

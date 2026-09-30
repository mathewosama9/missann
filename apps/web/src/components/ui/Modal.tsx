import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'md' | 'lg';
}

// النوافذ المفتوحة بترتيب فتحها: Escape يغلق العليا فقط (معاينة ملف فوق نافذة التصحيح مثلاً)،
// وتمرير الصفحة يبقى مقفولاً حتى تُغلق آخر نافذة
const openStack: object[] = [];

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const entry = {};
    openStack.push(entry);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || openStack[openStack.length - 1] !== entry) return;
      e.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      openStack.splice(openStack.indexOf(entry), 1);
      if (openStack.length === 0) document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`card animate-pop max-h-[90vh] w-full overflow-y-auto p-6 sm:p-7 ${
          size === 'lg' ? 'max-w-2xl' : 'max-w-md'
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-extrabold text-ink-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="btn-icon h-9 w-9"
            aria-label="إغلاق"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// حوار تأكيد (الافتراضي: حذف). confirmLabel/tone اختياريان لتأكيدات أخرى (إرسال جماعي مثلاً)
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  loading,
  confirmLabel = 'تأكيد الحذف',
  loadingLabel = 'جارٍ الحذف...',
  tone = 'danger',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  loading?: boolean;
  confirmLabel?: string;
  loadingLabel?: string;
  tone?: 'danger' | 'primary';
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="whitespace-pre-line leading-7 text-ink-500">{message}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>
          إلغاء
        </button>
        <button
          type="button"
          className={tone === 'danger' ? 'btn bg-coral-500 text-white hover:bg-coral-600' : 'btn-primary'}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? loadingLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

import { useState } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/notify';

// كلمة مرور مؤقتة: تُعرض مرة واحدة فقط (الخادم لا يخزّنها نصاً) — تُنسخ وتُبلَّغ لصاحب الحساب
export function TempPasswordModal({ password, name, onClose }: { password: string | null; name: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password ?? '');
      setCopied(true);
      toast.success('تم النسخ');
    } catch {
      toast.warning('انسخ الكلمة يدوياً');
    }
  };
  const close = () => {
    setCopied(false);
    onClose();
  };
  return (
    <Modal
      open={password !== null}
      onClose={close}
      title="كلمة المرور الجديدة"
    >
      <p className="text-sm leading-7 text-ink-500">
        بلّغ <span className="font-semibold text-ink-900">{name}</span> بالكلمة دي. مش هتظهر تاني بعد ما تقفل النافذة، وكل الأجهزة اتسجّل خروجها.
      </p>
      <div className="mt-4 flex items-center gap-2 rounded-2xl bg-paper-100 p-3">
        <KeyRound size={18} className="shrink-0 text-ink-400" />
        <code dir="ltr" className="flex-1 select-all break-all text-center font-mono text-xl font-bold tracking-wider text-ink-900" data-testid="temp-password">
          {password}
        </code>
        <button type="button" className="btn-icon h-9 w-9 shrink-0" onClick={copy} aria-label="نسخ">
          <Copy size={16} />
        </button>
      </div>
      <div className="mt-6 flex justify-end">
        <button type="button" className="btn-primary" onClick={close}>
          {copied ? 'تمام، نسختها' : 'تم'}
        </button>
      </div>
    </Modal>
  );
}

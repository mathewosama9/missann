import type { LucideIcon } from 'lucide-react';

// حالة فارغة: أيقونة دائرية داخل بطاقة بإطار متقطّع
export function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="card grid place-items-center gap-3 border-dashed p-12 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-paper-100 text-ink-500">
        <Icon size={24} />
      </span>
      <p className="font-semibold text-ink-900">{title}</p>
      <p className="text-sm text-ink-400">{text}</p>
    </div>
  );
}

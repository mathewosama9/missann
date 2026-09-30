import { Hammer } from 'lucide-react';
import { PageTitle } from '../../components/ui/StatCard';

export function DashPlaceholder({ title }: { title: string }) {
  return (
    <div>
      <PageTitle title={title} />
      <div className="card mt-6 grid place-items-center gap-3 border-dashed p-14 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-paper-100 text-ink-500">
          <Hammer size={24} />
        </span>
        <p className="font-semibold text-ink-900">هذا القسم قيد الإنشاء</p>
        <p className="text-sm text-ink-400">سيُستكمل في مرحلته القادمة.</p>
      </div>
    </div>
  );
}

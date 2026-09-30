import { Users, BadgeCheck, Banknote, Ticket, BarChart3 } from 'lucide-react';
import { StatCard, PageTitle } from '../../components/ui/StatCard';

export function AdminOverview() {
  return (
    <div>
      <PageTitle title="لوحة القيادة" subtitle="نظرة سريعة على أداء المنصة" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="إجمالي الطلاب" value="—" icon={Users} tone="ink" />
        <StatCard label="اشتراكات نشطة" value="—" icon={BadgeCheck} tone="lime" />
        <StatCard label="إيراد الشهر" value="—" icon={Banknote} tone="brand" />
        <StatCard label="أكواد مستخدمة" value="—" icon={Ticket} tone="coral" />
      </div>
      <div className="card mt-6 grid place-items-center gap-3 border-dashed p-12 text-center text-ink-400">
        <BarChart3 size={32} className="text-ink-300" />
        الرسوم البيانية وأحدث الاشتراكات والمدفوعات ستظهر هنا بعد استكمال الوحدات.
      </div>
    </div>
  );
}

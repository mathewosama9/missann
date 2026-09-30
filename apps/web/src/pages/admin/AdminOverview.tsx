import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Users, BadgeCheck, Banknote, Ticket, CalendarDays, BookOpen, ClipboardList, FileText, Video, RefreshCw, type LucideIcon } from 'lucide-react';
import {
  ENROLLMENT_SOURCE_LABELS,
  GRADE_SHORT,
  PAYMENT_STATUS_LABELS,
  formatEGP,
  type AdminStatsDTO,
  type PaymentStatus,
} from '@miss-ann/shared';
import { useAuth } from '../../store/auth';
import { StatCard, PageTitle } from '../../components/ui/StatCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { apiErrorMessage } from '../../lib/api';
import { formatRelative } from '../../lib/format';
import { adminApi, adminKeys } from '../../features/admin/api';
import { ActivityChart, RevenueChart } from '../../features/admin/StatsCharts';

const STATUS_TAG: Record<PaymentStatus, string> = {
  PENDING: 'bg-paper-100 text-ink-600',
  PAID: 'bg-lime-200 text-ink-900',
  FAILED: 'bg-coral-100 text-coral-600',
};

const split = (r: AdminStatsDTO['kpis']['revenueToday']) => `أونلاين ${formatEGP(r.online)} · كروت ${formatEGP(r.codes)}`;

export function AdminOverview() {
  // الإحصائيات فيها الإيراد ← للأدمن فقط؛ المساعد يرى اختصارات أقسامه
  const isAdmin = useAuth((s) => s.user?.role === 'ADMIN');
  return isAdmin ? <AdminStats /> : <AssistantHome />;
}

function AdminStats() {
  const statsQ = useQuery({ queryKey: adminKeys.stats, queryFn: adminApi.stats, staleTime: 60_000 });
  const s = statsQ.data;

  return (
    <div className="space-y-6">
      <PageTitle
        title="لوحة القيادة"
        subtitle="نظرة سريعة على أداء المنصة (بتوقيت القاهرة، تتحدث كل دقيقة)."
        action={
          <button type="button" className="btn-ghost" onClick={() => void statsQ.refetch()} disabled={statsQ.isFetching}>
            <RefreshCw size={16} className={statsQ.isFetching ? 'animate-spin' : ''} /> تحديث
          </button>
        }
      />

      {statsQ.isError ? (
        <div className="card p-8 text-center text-coral-600">{apiErrorMessage(statsQ.error)}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {!s ? (
            Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-32 rounded-4xl" />)
          ) : (
            <>
              <StatCard label="إجمالي الطلاب" value={s.kpis.students.toLocaleString('ar-EG')} icon={Users} tone="ink" />
              <StatCard label="اشتراكات نشطة" value={s.kpis.activeEnrollments.toLocaleString('ar-EG')} icon={BadgeCheck} tone="lime" />
              <StatCard label="إيراد اليوم" value={formatEGP(s.kpis.revenueToday.total)} hint={split(s.kpis.revenueToday)} icon={Banknote} tone="brand" />
              <StatCard label="إيراد الشهر" value={formatEGP(s.kpis.revenueMonth.total)} hint={split(s.kpis.revenueMonth)} icon={CalendarDays} tone="brand" />
              <StatCard label="أكواد مستخدمة" value={s.kpis.usedCodes.toLocaleString('ar-EG')} icon={Ticket} tone="coral" />
            </>
          )}
        </div>
      )}

      {s ? (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <RevenueChart data={s.daily} />
            <ActivityChart data={s.daily} />
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <GradeBars rows={s.studentsByGrade} total={s.kpis.students} />
            <LatestEnrollments rows={s.latestEnrollments} />
            <LatestPayments rows={s.latestPayments} />
          </div>
          <p className="text-xs text-ink-400">
            الإيراد = الدفع الأونلاين المؤكَّد + قيمة كروت الشحن المستخدمة. الشحن اليدوي من الإدارة لا يُحتسب هنا. آخر تحديث{' '}
            {formatRelative(s.generatedAt)}.
          </p>
        </>
      ) : (
        !statsQ.isError && (
          <div className="grid gap-4 xl:grid-cols-2">
            <Skeleton className="h-80 rounded-4xl" />
            <Skeleton className="h-80 rounded-4xl" />
          </div>
        )
      )}
    </div>
  );
}

// توزيع الطلاب على الصفوف: سلسلة واحدة ← أعمدة أفقية بلون واحد وقيمة مكتوبة (بلا مفتاح ألوان)
function GradeBars({ rows, total }: { rows: AdminStatsDTO['studentsByGrade']; total: number }) {
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="card p-5">
      <h2 className="font-display text-lg font-extrabold text-ink-900">الطلاب حسب الصف</h2>
      {total === 0 ? (
        <p className="mt-6 text-center text-sm text-ink-400">لا يوجد طلاب بعد</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {sorted.map((r) => (
            <li key={r.grade ?? 'none'} title={`${r.count} طالب`}>
              <div className="flex justify-between text-sm">
                <span className="text-ink-600">{r.grade ? GRADE_SHORT[r.grade] : 'بدون صف'}</span>
                <span className="font-semibold tabular-nums text-ink-900">{r.count.toLocaleString('ar-EG')}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-paper-100">
                <div className="h-2 rounded-full bg-[#3D55F5]" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LatestEnrollments({ rows }: { rows: AdminStatsDTO['latestEnrollments'] }) {
  return (
    <div className="card p-5">
      <h2 className="font-display text-lg font-extrabold text-ink-900">أحدث الاشتراكات</h2>
      {rows.length === 0 ? (
        <p className="mt-6 text-center text-sm text-ink-400">لا توجد اشتراكات بعد</p>
      ) : (
        <ul className="mt-3 divide-y divide-ink-900/[0.06]">
          {rows.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <Link to={`/admin/students/${e.user.id}`} className="block truncate text-sm font-semibold text-ink-800 hover:text-brand-600">
                  {e.user.name}
                </Link>
                <div className="truncate text-xs text-ink-400">{e.course.title}</div>
              </div>
              <div className="shrink-0 text-left text-xs text-ink-400">
                <div>{ENROLLMENT_SOURCE_LABELS[e.source]}</div>
                <div>{formatRelative(e.createdAt)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LatestPayments({ rows }: { rows: AdminStatsDTO['latestPayments'] }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-extrabold text-ink-900">أحدث المدفوعات</h2>
        <Link to="/admin/payments" className="text-xs font-semibold text-brand-600">
          الكل
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="mt-6 text-center text-sm text-ink-400">لا توجد مدفوعات أونلاين بعد</p>
      ) : (
        <ul className="mt-3 divide-y divide-ink-900/[0.06]">
          {rows.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink-800">{p.user.name}</div>
                <div className="truncate text-xs text-ink-400">{p.courseTitle ?? (p.purpose === 'TOPUP' ? 'شحن محفظة' : 'اشتراك كورس')}</div>
              </div>
              <div className="shrink-0 text-left">
                <div className="text-sm font-semibold tabular-nums text-brand-600">{formatEGP(p.amount)}</div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TAG[p.status]}`}>{PAYMENT_STATUS_LABELS[p.status]}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── المساعد: اختصارات الأقسام المتاحة له ────────────────────────────
const ASSISTANT_LINKS: { to: string; label: string; text: string; icon: LucideIcon }[] = [
  { to: '/admin/exams', label: 'الامتحانات', text: 'إنشاء الامتحانات وتصحيح الإجابات الكتابية', icon: ClipboardList },
  { to: '/admin/homework', label: 'الواجبات', text: 'استعراض التسليمات والتصحيح', icon: FileText },
  { to: '/admin/courses', label: 'الكورسات والحصص', text: 'الحصص والمرفقات والفيديوهات', icon: BookOpen },
  { to: '/admin/live', label: 'الحصص اللايف', text: 'جدولة الجلسات وتعديلها', icon: Video },
];

function AssistantHome() {
  const name = useAuth((s) => s.user?.name);
  return (
    <div className="space-y-6">
      <PageTitle title={`أهلاً، ${name ?? ''}`} subtitle="اختر القسم اللي عايز تشتغل عليه." />
      <div className="grid gap-4 sm:grid-cols-2">
          {ASSISTANT_LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="card card-hover flex items-start gap-4 p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lime-300 text-ink-900">
                <l.icon size={19} />
              </span>
              <span>
                <span className="block font-display text-lg font-extrabold text-ink-900">{l.label}</span>
                <span className="text-sm text-ink-500">{l.text}</span>
              </span>
            </Link>
          ))}
      </div>
    </div>
  );
}

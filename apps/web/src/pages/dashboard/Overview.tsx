import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Wallet, ClipboardList, FileText, ArrowUpLeft, Hand } from 'lucide-react';
import { GRADE_LABELS, formatEGP } from '@miss-ann/shared';
import { useAuth } from '../../store/auth';
import { StatCard } from '../../components/ui/StatCard';
import { AtomArt } from '../../components/ScienceArt';
import { walletApi } from '../../features/wallet/api';

export function StudentOverview() {
  const user = useAuth((s) => s.user);
  const walletQ = useQuery({ queryKey: ['wallet'], queryFn: walletApi.get });
  return (
    <div className="space-y-6">
      {/* ترحيب */}
      <section className="relative overflow-hidden rounded-4xl bg-ink-900 p-7 pb-36 text-paper sm:p-9 sm:pb-36 md:pb-9">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
        <AtomArt tone="dark" className="absolute -bottom-12 -left-8 w-44 opacity-90 md:-bottom-20 md:-left-10 md:w-72" />
        <div className="relative z-10 max-w-lg">
          <span className="inline-flex items-center gap-2 rounded-full border border-paper/20 px-3 py-1 text-xs text-paper/70">
            <Hand size={14} /> {user?.grade ? GRADE_LABELS[user.grade] : 'لوحة الطالب'}
          </span>
          <h1 className="mt-4 font-display text-4xl font-extrabold">
            أهلاً، <span className="text-lime-300">{user?.name}</span>
          </h1>
          <p className="mt-2 text-paper/60">استمر في رحلتك مع العلوم — كل حصة بتقرّبك من هدفك.</p>
          <Link to="/courses" className="btn-accent mt-6">
            تصفّح الكورسات <ArrowUpLeft size={16} />
          </Link>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="كورساتي النشطة" value="—" icon={BookOpen} tone="lime" />
        <Link to="/dashboard/wallet" className="rounded-4xl transition hover:-translate-y-0.5">
          <StatCard
            label="رصيد المحفظة"
            value={walletQ.data ? formatEGP(walletQ.data.balance) : '—'}
            icon={Wallet}
            tone="brand"
          />
        </Link>
        <StatCard label="امتحانات قادمة" value="—" icon={ClipboardList} tone="coral" />
        <StatCard label="واجبات مطلوبة" value="—" icon={FileText} tone="ink" />
      </div>

      <div className="card border-dashed p-8 text-center text-ink-400">
        سيتم عرض آخر الحصص والنتائج والتنبيهات هنا بعد استكمال الوحدات.
      </div>
    </div>
  );
}

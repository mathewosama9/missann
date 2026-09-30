import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import { PageTitle } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { apiErrorMessage } from '../../lib/api';
import { dashboardApi, dashboardKeys } from '../../features/dashboard/api';
import { MyCourseCard } from '../../features/dashboard/MyCourseCard';

export function MyCourses() {
  const coursesQ = useQuery({ queryKey: dashboardKeys.courses, queryFn: dashboardApi.courses });
  const items = coursesQ.data ?? [];
  const active = items.filter((c) => c.active);
  const ended = items.filter((c) => !c.active);

  return (
    <div className="space-y-6">
      <PageTitle
        title="كورساتي"
        subtitle="الكورسات المشترك فيها وتقدّمك في كل كورس."
        action={
          <Link to="/courses" className="btn-ghost">
            تصفّح الكورسات
          </Link>
        }
      />
      {coursesQ.isPending ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-4xl" />
          ))}
        </div>
      ) : coursesQ.isError ? (
        <div className="card p-8 text-center text-coral-600">{apiErrorMessage(coursesQ.error)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={BookOpen} title="لسه مش مشترك في كورسات" text="اختار كورس صفّك من صفحة الكورسات واشترك من المحفظة أو بكارت شحن." />
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-xl font-extrabold text-ink-900">الاشتراكات السارية</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {active.map((c) => (
                  <MyCourseCard key={c.courseId} c={c} />
                ))}
              </div>
            </section>
          )}
          {ended.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-xl font-extrabold text-ink-900">اشتراكات منتهية</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {ended.map((c) => (
                  <MyCourseCard key={c.courseId} c={c} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

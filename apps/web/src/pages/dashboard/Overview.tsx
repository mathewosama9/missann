import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Wallet, ClipboardList, FileText, ArrowUpLeft, Hand, PlayCircle, Star, Trophy, BellOff } from 'lucide-react';
import { GRADE_LABELS, formatEGP, starBadge, type NotificationDTO } from '@miss-ann/shared';
import { useAuth } from '../../store/auth';
import { StatCard } from '../../components/ui/StatCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { AtomArt } from '../../components/ScienceArt';
import { apiErrorMessage } from '../../lib/api';
import { formatRelative } from '../../lib/format';
import { dashboardApi, dashboardKeys } from '../../features/dashboard/api';
import { MyCourseCard } from '../../features/dashboard/MyCourseCard';
import { inboxKeys, notificationsApi } from '../../features/notifications/api';
import { NotificationItem } from '../../features/notifications/NotificationItem';
import { useMarkRead } from '../../features/notifications/useInbox';

const INBOX_PREVIEW = 4;

export function StudentOverview() {
  const user = useAuth((s) => s.user);
  const overviewQ = useQuery({ queryKey: dashboardKeys.overview, queryFn: dashboardApi.overview });
  const o = overviewQ.data;

  return (
    <div className="space-y-6">
      {/* ترحيب + النجوم والشارة */}
      <section className="relative overflow-hidden rounded-4xl bg-ink-900 p-7 pb-36 text-paper sm:p-9 sm:pb-36 md:pb-9">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
        <AtomArt tone="dark" className="absolute -bottom-12 -left-8 w-44 opacity-90 md:-bottom-20 md:-left-10 md:w-72" />
        <div className="relative z-10 max-w-lg">
          <span className="inline-flex items-center gap-2 rounded-full border border-paper/20 px-3 py-1 text-xs text-paper/70">
            <Hand size={14} /> {user?.grade ? GRADE_LABELS[user.grade] : 'لوحة الطالب'}
          </span>
          <h1 className="mt-4 break-words font-display text-4xl font-extrabold">
            أهلاً، <span className="text-lime-300">{user?.name}</span>
          </h1>
          <p className="mt-2 text-paper/60">استمر في رحلتك مع العلوم — كل حصة بتقرّبك من هدفك.</p>
          {o && <BadgeLine stars={o.stars} />}
          <Link to={o?.lastLesson ? `/course/${o.lastLesson.courseId}/lesson/${o.lastLesson.lessonId}` : '/courses'} className="btn-accent mt-6">
            {o?.lastLesson ? 'كمّل آخر حصة' : 'تصفّح الكورسات'} <ArrowUpLeft size={16} />
          </Link>
        </div>
      </section>

      {overviewQ.isError ? (
        <div className="card p-8 text-center text-coral-600">{apiErrorMessage(overviewQ.error)}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {!o ? (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32 rounded-4xl" />)
          ) : (
            <>
              <Link to="/dashboard/courses" className="rounded-4xl transition hover:-translate-y-0.5">
                <StatCard label="كورساتي النشطة" value={String(o.activeCoursesCount)} icon={BookOpen} tone="lime" />
              </Link>
              <Link to="/dashboard/wallet" className="rounded-4xl transition hover:-translate-y-0.5">
                <StatCard label="رصيد المحفظة" value={formatEGP(o.balance)} icon={Wallet} tone="brand" />
              </Link>
              <Link to="/dashboard/exams" className="rounded-4xl transition hover:-translate-y-0.5">
                <StatCard label="امتحانات متاحة وقادمة" value={String(o.upcomingExams)} icon={ClipboardList} tone="coral" />
              </Link>
              <Link to="/dashboard/homework" className="rounded-4xl transition hover:-translate-y-0.5">
                <StatCard label="واجبات مطلوبة" value={String(o.requiredHomework)} icon={FileText} tone="ink" />
              </Link>
            </>
          )}
        </div>
      )}

      {o && (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            {o.lastLesson && (
              <Link to={`/course/${o.lastLesson.courseId}/lesson/${o.lastLesson.lessonId}`} className="card card-hover flex items-center gap-4 p-5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-500 text-white">
                  <PlayCircle size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-ink-400">آخر حصة · {formatRelative(o.lastLesson.updatedAt)}</span>
                  <span className="block truncate font-extrabold text-ink-900">{o.lastLesson.lessonTitle}</span>
                  <span className="block truncate text-sm text-ink-500">{o.lastLesson.courseTitle}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-ink-800">{Math.round(o.lastLesson.percent)}٪</span>
              </Link>
            )}

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-xl font-extrabold text-ink-900">اشتراكاتي النشطة</h2>
                <Link to="/dashboard/courses" className="text-sm font-semibold text-brand-600">
                  كل كورساتي
                </Link>
              </div>
              {o.activeCourses.length === 0 ? (
                <div className="card border-dashed p-8 text-center text-sm text-ink-400">
                  مفيش اشتراكات سارية.{' '}
                  <Link to="/courses" className="font-semibold text-brand-600">
                    اختار كورس
                  </Link>
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {o.activeCourses.map((c) => (
                    <MyCourseCard key={c.courseId} c={c} />
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-4">
            <RecentResults rows={o.recentResults} />
            <LatestNotifications />
          </div>
        </div>
      )}
    </div>
  );
}

function BadgeLine({ stars }: { stars: number }) {
  const b = starBadge(stars);
  return (
    <div className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-2xl bg-paper/10 px-3 py-2 text-sm">
      <Star size={16} className="fill-science-yellow text-science-yellow" />
      <span className="font-semibold">{stars} نجمة</span>
      <span className="text-paper/60">· شارة «{b.label}»</span>
      {b.next && <span className="text-xs text-paper/50">(باقي {b.next.remaining} لشارة «{b.next.label}»)</span>}
    </div>
  );
}

function RecentResults({ rows }: { rows: { attemptId: number; title: string; score: number; totalPoints: number; submittedAt: string | null }[] }) {
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-extrabold text-ink-900">آخر النتائج</h2>
        <Link to="/dashboard/exams" className="text-xs font-semibold text-brand-600">
          الامتحانات
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="mt-5 text-center text-sm text-ink-400">مفيش نتائج معلنة لسه</p>
      ) : (
        <ul className="mt-3 divide-y divide-ink-900/[0.06]">
          {rows.map((r) => (
            <li key={r.attemptId}>
              <Link to={`/dashboard/exams/result/${r.attemptId}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-brand-600">
                <span className="flex min-w-0 items-center gap-2">
                  <Trophy size={16} className="shrink-0 text-science-yellow" />
                  <span className="truncate text-sm font-semibold text-ink-800">{r.title}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-ink-900">
                  {r.score}/{r.totalPoints}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// آخر الإشعارات: نفس استعلام وكاش صندوق الإشعارات (القراءة هنا تحدّث الجرس والصفحة)
function LatestNotifications() {
  const listQ = useQuery({
    queryKey: inboxKeys.list('all', 1, INBOX_PREVIEW),
    queryFn: () => notificationsApi.list({ filter: 'all', page: 1, pageSize: INBOX_PREVIEW }),
  });
  const markRead = useMarkRead();
  const open = (n: NotificationDTO) => !n.isRead && markRead.mutate(n.id);
  const items = listQ.data?.items ?? [];
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-extrabold text-ink-900">التنبيهات</h2>
        <Link to="/dashboard/notifications" className="text-xs font-semibold text-brand-600">
          الكل
        </Link>
      </div>
      <div className="mt-3 space-y-1">
        {listQ.isPending ? (
          <Skeleton className="h-16" />
        ) : listQ.isError ? (
          <p className="py-6 text-center text-sm text-coral-600">{apiErrorMessage(listQ.error, 'تعذّر تحميل التنبيهات')}</p>
        ) : items.length === 0 ? (
          <div className="grid place-items-center gap-2 py-6 text-center text-sm text-ink-400">
            <BellOff size={20} /> لا توجد تنبيهات
          </div>
        ) : (
          items.map((n) => <NotificationItem key={n.id} n={n} onOpen={open} compact />)
        )}
      </div>
    </section>
  );
}

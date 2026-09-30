import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Users, Gauge, Trophy, Target, Flame, AlertTriangle, BarChart3, PenLine, Eye } from 'lucide-react';
import { ATTEMPT_STATUS_LABELS, type ExamAnalyticsDTO } from '@miss-ann/shared';
import { PageTitle, StatCard } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pager } from '../../components/ui/Pager';
import { Spinner } from '../../components/ui/Spinner';
import { adminExamsApi } from '../../features/exams/api';
import { apiErrorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

export function AdminExamAnalytics() {
  const id = Number(useParams().id);
  const [page, setPage] = useState(1);
  const [params, setParams] = useSearchParams();
  const grading = params.get('grading') === 'PENDING' ? 'PENDING' : undefined;
  const statsQ = useQuery({ queryKey: ['admin', 'exam-analytics', id], queryFn: () => adminExamsApi.analytics(id), staleTime: 0 });
  const attemptsQ = useQuery({
    queryKey: ['admin', 'exam-attempts', id, grading ?? 'ALL', page],
    queryFn: () => adminExamsApi.attempts(id, { page, grading }),
    placeholderData: (p) => p,
  });

  if (statsQ.isPending) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="h-8 w-8 text-brand-500" />
      </div>
    );
  }
  if (statsQ.isError) return <EmptyState icon={AlertTriangle} title="تعذّر تحميل التحليلات" text={apiErrorMessage(statsQ.error)} />;
  const s = statsQ.data;
  const none = s.finished === 0;

  return (
    <div className="space-y-6">
      <Link to={`/admin/exams/${id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
        <ArrowRight size={16} /> الأسئلة والإعدادات
      </Link>
      <PageTitle title="تحليلات الامتحان" subtitle={s.title} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="محاولات مصحّحة"
          value={`${s.finished}${s.pendingGrading ? ` · ${s.pendingGrading} للتصحيح` : ''}${s.inProgress ? ` · ${s.inProgress} جارية` : ''}`}
          icon={Users}
          tone="ink"
        />
        <StatCard
          label="متوسط الدرجات"
          value={none ? '—' : `${s.average}/${s.totalPoints} · ${s.averagePercent}%`}
          icon={Gauge}
          tone="brand"
        />
        <StatCard label="أعلى / أقل درجة" value={none ? '—' : `${s.highest} / ${s.lowest}`} icon={Trophy} tone="lime" />
        <StatCard label={`نسبة النجاح (≥ ${s.passScore}%)`} value={none ? '—' : `${s.passRate}%`} icon={Target} tone="coral" />
      </div>

      {none ? (
        <EmptyState
          icon={BarChart3}
          title="لا نتائج بعد"
          text={s.pendingGrading ? 'صحّحي الإجابات الكتابية لتظهر التحليلات.' : 'تظهر التحليلات بعد أن يسلّم أول طالب الامتحان.'}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
          <Distribution s={s} />
          <QuestionStats s={s} />
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-900/[0.06] p-5">
          <h2 className="font-display text-xl font-extrabold text-ink-900">نتائج الطلاب</h2>
          <div className="inline-flex rounded-full border border-ink-900/10 bg-paper-50 p-1" role="tablist">
            {(
              [
                [undefined, 'الكل'],
                ['PENDING', `ينتظر التصحيح (${s.pendingGrading})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={grading === key}
                onClick={() => {
                  setPage(1);
                  setParams(key ? { grading: key } : {}, { replace: true });
                }}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  grading === key ? 'bg-ink-900 text-paper' : 'text-ink-600 hover:text-ink-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {attemptsQ.data && attemptsQ.data.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-right">
              <thead className="bg-paper-50">
                <tr className="border-b border-ink-900/[0.06] text-xs text-ink-400">
                  <th className="p-4 font-semibold">الطالب</th>
                  <th className="p-4 font-semibold">الدرجة</th>
                  <th className="p-4 font-semibold">الحالة</th>
                  <th className="p-4 font-semibold">التسليم</th>
                  <th className="p-4 font-semibold">التصحيح</th>
                </tr>
              </thead>
              <tbody>
                {attemptsQ.data.items.map((a) => (
                  <tr key={a.id} className="border-b border-ink-900/[0.06] last:border-0 hover:bg-paper-50">
                    <td className="p-4">
                      <div className="font-semibold text-ink-800">{a.user.name}</div>
                      <div className="text-xs text-ink-400" dir="ltr">
                        {a.user.phone}
                      </div>
                    </td>
                    <td className="whitespace-nowrap p-4 text-sm font-semibold text-ink-800 tabular-nums">
                      {a.needsGrading ? (
                        <span className="text-coral-700">بانتظار التصحيح</span>
                      ) : a.score === null ? (
                        '—'
                      ) : (
                        `${a.score}/${a.totalPoints} · ${a.percent}%`
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className={`tag ${
                          a.status === 'SUBMITTED'
                            ? 'bg-lime-200 text-ink-900'
                            : a.status === 'EXPIRED'
                              ? 'bg-coral-100 text-coral-700'
                              : 'bg-brand-50 text-brand-700'
                        }`}
                      >
                        {ATTEMPT_STATUS_LABELS[a.status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap p-4 text-sm text-ink-500">{a.submittedAt ? formatDateTime(a.submittedAt) : '—'}</td>
                    <td className="p-4">
                      {a.status !== 'IN_PROGRESS' && (
                        <Link
                          to={`/admin/exams/${id}/attempts/${a.id}`}
                          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                            a.needsGrading ? 'bg-coral-500 text-white hover:bg-coral-600' : 'bg-paper-100 text-ink-700 hover:bg-paper-200'
                          }`}
                        >
                          {a.needsGrading ? <PenLine size={14} /> : <Eye size={14} />} {a.needsGrading ? 'صحّحي' : 'عرض'}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-6 text-sm text-ink-400">{grading ? 'لا محاولات تنتظر التصحيح.' : 'لم يبدأ أي طالب بعد.'}</p>
        )}
        {attemptsQ.data && (
          <div className="px-5 pb-4">
            <Pager page={attemptsQ.data.page} totalPages={attemptsQ.data.totalPages} total={attemptsQ.data.total} onChange={setPage} />
          </div>
        )}
      </section>
    </div>
  );
}

// توزيع الدرجات: سلسلة واحدة بلون واحد (لا مفتاح ألوان)، أعمدة رفيعة بفواصل، tooltip عند المرور
function Distribution({ s }: { s: ExamAnalyticsDTO }) {
  const max = Math.max(1, ...s.distribution.map((b) => b.count));
  const peak = s.distribution.findIndex((b) => b.count === max);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <section className="card p-5">
      <h2 className="font-display text-xl font-extrabold text-ink-900">توزيع الدرجات</h2>
      <p className="mt-1 text-sm text-ink-500">عدد الطلاب في كل نطاق نسبة مئوية</p>
      <div className="relative mt-6 flex h-48 items-end gap-[2px] border-b border-ink-900/15" role="img" aria-label="توزيع الدرجات">
        {s.distribution.map((b, i) => {
          const h = (b.count / max) * 100;
          return (
            <div
              key={b.label}
              className="relative flex h-full flex-1 items-end justify-center px-2"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${b.label}: ${b.count} طالب`}
            >
              {(i === peak || hover === i) && b.count > 0 && (
                <span className="absolute text-xs font-semibold text-ink-700 tabular-nums" style={{ bottom: `calc(${h}% + 6px)` }}>
                  {b.count}
                </span>
              )}
              <div
                className={`w-full max-w-10 rounded-t-[4px] transition ${hover === i ? 'bg-brand-600' : 'bg-brand-500'}`}
                style={{ height: `${h}%`, minHeight: b.count > 0 ? 3 : 0 }}
              />
              {hover === i && (
                <div className="pointer-events-none absolute -top-2 z-10 -translate-y-full whitespace-nowrap rounded-xl bg-ink-900 px-3 py-1.5 text-xs text-paper shadow-soft" dir="rtl">
                  {b.label} · <b className="tabular-nums">{b.count}</b> طالب
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-[2px] text-center text-[11px] text-ink-400">
        {s.distribution.map((b) => (
          <span key={b.label} className="flex-1">
            {b.label}
          </span>
        ))}
      </div>
    </section>
  );
}

// نسبة الخطأ لكل سؤال (عدم الإجابة = خطأ) — الأصعب مميّز بأيقونة + وسم، لا باللون وحده
function QuestionStats({ s }: { s: ExamAnalyticsDTO }) {
  return (
    <section className="card p-5">
      <h2 className="font-display text-xl font-extrabold text-ink-900">صعوبة الأسئلة</h2>
      <p className="mt-1 text-sm text-ink-500">نسبة عدم الحصول على الدرجة كاملة من {s.finished} محاولة مصحّحة</p>
      <ul className="mt-4 space-y-3">
        {s.questions.map((q) => {
          const hardest = s.hardest?.questionId === q.questionId;
          return (
            <li key={q.questionId} className={`rounded-2xl border p-3 ${hardest ? 'border-coral-300 bg-coral-100/50' : 'border-ink-900/[0.06]'}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="line-clamp-2 text-sm font-semibold text-ink-800">
                  <span className="text-ink-400 tabular-nums">{q.order}.</span> {q.text}
                </p>
                {hardest && (
                  <span className="tag shrink-0 bg-coral-500 text-white">
                    <Flame size={13} /> الأصعب
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-100">
                  <div
                    className={`h-full rounded-full ${hardest ? 'bg-coral-500' : 'bg-ink-300'}`}
                    style={{ width: `${q.errorRate}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-left text-xs text-ink-600 tabular-nums">
                  خطأ {q.errorRate}% · صح {q.correct}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

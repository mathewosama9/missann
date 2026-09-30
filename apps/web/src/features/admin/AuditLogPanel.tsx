import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { AUDIT_ACTION_LABELS, ROLE_LABELS } from '@miss-ann/shared';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pager, useClampPage } from '../../components/ui/Pager';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { apiErrorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { adminApi, adminKeys, type AuditQuery } from './api';

const ACTIONS = Object.entries(AUDIT_ACTION_LABELS).sort((a, b) => a[1].localeCompare(b[1], 'ar'));
const ENTITIES = ['User', 'Course', 'Lesson', 'Attachment', 'Exam', 'Question', 'ExamAttempt', 'Homework', 'HomeworkSubmission', 'LiveSession', 'Enrollment', 'Wallet', 'RedeemCode', 'CodeBatch', 'Payment', 'NotificationBroadcast', 'NotificationTemplate', 'Device', 'PlatformSettings', 'Upload'];

// تاريخ اليوم المحلي (من input type=date) ← بداية/نهاية اليوم بتوقيت الجهاز كـ ISO
const dayStart = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);
const dayEnd = (d: string) => (d ? new Date(`${d}T23:59:59.999`).toISOString() : undefined);

// سجل كل العمليات الحساسة — الـ meta تصل مُنقّاة (بلا مفاتيح سرية) وتُعرض كنص فقط
export function AuditLogPanel() {
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const badRange = Boolean(from && to && from > to);

  const query: AuditQuery = {
    page,
    ...(action && { action }),
    ...(entity && { entity }),
    ...(dayStart(from) && { from: dayStart(from) }),
    ...(dayEnd(to) && { to: dayEnd(to) }),
  };
  const logQ = useQuery({ queryKey: adminKeys.audit(query), queryFn: () => adminApi.audit(query), placeholderData: keepPreviousData, enabled: !badRange });
  const data = logQ.data;
  useClampPage(page, data?.totalPages, setPage);
  const set = (fn: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    fn(e.target.value);
    setPage(1);
  };

  return (
    <section className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <select className="input py-2" value={action} onChange={set(setAction)} aria-label="العملية">
          <option value="">كل العمليات</option>
          {ACTIONS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select className="input py-2" value={entity} onChange={set(setEntity)} aria-label="النوع">
          <option value="">كل الأنواع</option>
          {ENTITIES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-ink-500">
          من
          <input type="date" className="input py-2" value={from} onChange={set(setFrom)} />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-500">
          إلى
          <input type="date" className="input py-2" value={to} onChange={set(setTo)} />
        </label>
      </div>
      {badRange && <p className="text-sm text-coral-600">تاريخ النهاية قبل تاريخ البداية.</p>}

      {badRange ? null : logQ.isPending ? (
        <SkeletonRows rows={6} className="h-20" />
      ) : logQ.isError ? (
        <div className="card p-8 text-center text-coral-600">{apiErrorMessage(logQ.error)}</div>
      ) : !data?.items.length ? (
        <EmptyState icon={ScrollText} title="لا توجد عمليات" text="غيّر الفلاتر أو المدة لعرض عمليات أخرى." />
      ) : (
        <>
          <ul className={`space-y-2 ${logQ.isFetching ? 'opacity-60' : ''}`}>
            {data.items.map((r) => (
              <li key={r.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink-900">{AUDIT_ACTION_LABELS[r.action] ?? r.action}</span>
                      <span className="rounded-full bg-paper-100 px-2 py-0.5 font-mono text-[11px] text-ink-500" dir="ltr">
                        {r.entity}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-ink-500">
                      {r.actor ? `${r.actor.name} (${ROLE_LABELS[r.actor.role]})` : 'النظام / زائر'}
                      {r.ip && (
                        <>
                          {' · '}
                          <span dir="ltr">{r.ip}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-ink-400">{formatDateTime(r.createdAt)}</span>
                </div>
                {r.meta.length > 0 && (
                  <dl className="mt-3 flex flex-wrap gap-1.5">
                    {r.meta.map((m) => (
                      <div key={m.key} className="flex max-w-full gap-1 rounded-xl bg-paper-50 px-2 py-1 text-[11px]" dir="ltr">
                        <dt className="shrink-0 font-semibold text-ink-500">{m.key}:</dt>
                        <dd className="min-w-0 break-all text-ink-700">{m.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ul>
          <Pager page={data.page} totalPages={data.totalPages} total={data.total} onChange={setPage} />
        </>
      )}
    </section>
  );
}

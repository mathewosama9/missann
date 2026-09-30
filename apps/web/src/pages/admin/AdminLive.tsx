import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '../../components/ui/notify';
import { Copy, Pencil, Plus, Trash2, Video } from 'lucide-react';
import { LIVE_PROVIDER_LABELS, liveJoinWindow, type AdminLiveSessionDTO } from '@miss-ann/shared';
import { PageTitle } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pager } from '../../components/ui/Pager';
import { Modal, ConfirmDialog } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { LiveForm } from '../../features/live/LiveForm';
import { adminLiveApi, type LivePayload } from '../../features/live/api';
import { adminCoursesApi } from '../../features/courses/api';
import { apiErrorMessage } from '../../lib/api';
import { formatDateTime, toLocalInput } from '../../lib/format';

type Scope = 'upcoming' | 'past';

export function AdminLive() {
  const qc = useQueryClient();
  const [scope, setScope] = useState<Scope>('upcoming');
  const [courseId, setCourseId] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminLiveSessionDTO | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AdminLiveSessionDTO | null>(null);

  const coursesQ = useQuery({
    queryKey: ['admin', 'courses', 'all'],
    queryFn: () => adminCoursesApi.list({ pageSize: 100 }),
  });
  const listQ = useQuery({
    queryKey: ['admin', 'live', { scope, courseId, page }],
    queryFn: () => adminLiveApi.list({ scope, page, courseId: Number(courseId) || undefined }),
    placeholderData: (prev) => prev,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'live'] });

  const saveM = useMutation({
    mutationFn: (d: LivePayload) => {
      if (editing && editing !== 'new') {
        const { courseId: _courseId, startAt, ...changes } = d;
        // الموعد يُرسل فقط لو تغيّر (تغييره يعيد جدولة التذكير)
        const moved = toLocalInput(startAt) !== toLocalInput(editing.startAt);
        return adminLiveApi.update(editing.id, moved ? { ...changes, startAt } : changes);
      }
      return adminLiveApi.create(d);
    },
    onSuccess: () => {
      toast.success(editing === 'new' ? 'تمت جدولة الحصة' : 'تم حفظ التعديلات');
      setEditing(null);
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const deleteM = useMutation({
    mutationFn: (id: number) => adminLiveApi.remove(id),
    onSuccess: () => {
      toast.success('تم حذف الحصة');
      setDeleting(null);
      invalidate();
    },
    onError: (e) => {
      toast.error(apiErrorMessage(e));
      setDeleting(null);
    },
  });

  const copy = (url: string) =>
    navigator.clipboard.writeText(url).then(
      () => toast.success('تم نسخ الرابط'),
      () => toast.error('تعذّر النسخ'),
    );

  const data = listQ.data;
  const now = Date.now();
  return (
    <div>
      <PageTitle
        title="الحصص اللايف"
        subtitle="جدولة حصص Zoom أو Google Meet لمشتركي كل كورس، مع تذكير قبل الموعد."
        action={
          <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
            <Plus size={18} /> حصة جديدة
          </button>
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-ink-900/10 bg-white p-1" role="tablist">
          {(
            [
              ['upcoming', 'القادمة'],
              ['past', 'السابقة'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={scope === key}
              onClick={() => {
                setScope(key);
                setPage(1);
              }}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                scope === key ? 'bg-ink-900 text-paper' : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          className="input w-full sm:w-auto"
          value={courseId}
          onChange={(e) => {
            setCourseId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">كل الكورسات</option>
          {coursesQ.data?.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      {listQ.isPending ? (
        <div className="grid place-items-center py-20">
          <Spinner className="h-8 w-8 text-brand-500" />
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Video}
            title={scope === 'upcoming' ? 'لا توجد حصص قادمة' : 'لا توجد حصص سابقة'}
            text={scope === 'upcoming' ? 'جدولي حصة لايف واختاري الكورس — تظهر لمشتركيه فقط.' : 'الحصص المنتهية تظهر هنا.'}
          />
        </div>
      ) : (
        <>
          <div className="card mt-6 overflow-x-auto">
            <table className="w-full min-w-[820px] text-right">
              <thead className="bg-paper-50">
                <tr className="border-b border-ink-900/[0.06] text-xs text-ink-400">
                  <th className="p-4 font-semibold">الحصة</th>
                  <th className="p-4 font-semibold">الكورس</th>
                  <th className="p-4 font-semibold">الموعد</th>
                  <th className="p-4 font-semibold">المدة</th>
                  <th className="p-4 font-semibold">الحالة</th>
                  <th className="p-4 font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => {
                  const start = Date.parse(s.startAt);
                  const { endsAt } = liveJoinWindow(new Date(start), s.durationMin);
                  const ended = endsAt.getTime() <= now;
                  const live = !ended && start <= now;
                  return (
                    <tr key={s.id} className="border-b border-ink-900/[0.06] last:border-0 hover:bg-paper-50">
                      <td className="p-4">
                        <div className="font-semibold text-ink-800">{s.title}</div>
                        <div className="mt-1 text-xs text-ink-400">{LIVE_PROVIDER_LABELS[s.provider]}</div>
                      </td>
                      <td className="p-4 text-sm text-ink-600">{s.courseTitle}</td>
                      <td className="whitespace-nowrap p-4 text-sm text-ink-600">{formatDateTime(s.startAt)}</td>
                      <td className="whitespace-nowrap p-4 text-sm text-ink-600">{s.durationMin} د</td>
                      <td className="p-4">
                        {ended ? (
                          <span className="tag bg-paper-100 text-ink-500">انتهت</span>
                        ) : live ? (
                          <span className="tag bg-lime-300 text-ink-900">
                            <span className="h-2 w-2 animate-pulse rounded-full bg-ink-900" /> مباشر الآن
                          </span>
                        ) : (
                          <span className="tag bg-brand-50 text-brand-700">قادمة</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="grid h-9 w-9 place-items-center rounded-full text-brand-600 hover:bg-brand-50"
                            onClick={() => copy(s.joinUrl)}
                            title="نسخ رابط الانضمام"
                          >
                            <Copy size={18} />
                          </button>
                          {!ended && (
                            <button
                              type="button"
                              className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-paper-100"
                              onClick={() => setEditing(s)}
                              title="تعديل"
                            >
                              <Pencil size={18} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="grid h-9 w-9 place-items-center rounded-full text-coral-600 hover:bg-coral-100"
                            onClick={() => setDeleting(s)}
                            title="حذف"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} totalPages={data.totalPages} total={data.total} onChange={setPage} />
        </>
      )}

      <Modal open={editing !== null} onClose={() => !saveM.isPending && setEditing(null)} title={editing === 'new' ? 'حصة لايف جديدة' : 'تعديل الحصة'} size="lg">
        {editing !== null && (
          <LiveForm
            key={editing === 'new' ? 'new' : editing.id}
            initial={editing === 'new' ? undefined : editing}
            onSubmit={(d) => saveM.mutate(d)}
            onCancel={() => setEditing(null)}
            saving={saveM.isPending}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteM.mutate(deleting.id)}
        title="حذف الحصة"
        message="ستُحذف الحصة ويُلغى تذكيرها، ولن تظهر للطلاب. هل أنت متأكدة؟"
        loading={deleteM.isPending}
      />
    </div>
  );
}

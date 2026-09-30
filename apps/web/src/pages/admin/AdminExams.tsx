import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '../../components/ui/notify';
import { Plus, Settings2, BarChart3, Eye, EyeOff, Trash2, ClipboardList, Bell, Search } from 'lucide-react';
import { GRADE_SHORT, Grade, GRADE_LABELS } from '@miss-ann/shared';
import { PageTitle } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pager } from '../../components/ui/Pager';
import { Modal, ConfirmDialog } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { ExamForm } from '../../features/exams/ExamForm';
import { adminExamsApi, type ExamPayload } from '../../features/exams/api';
import { apiErrorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

export function AdminExams() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [grade, setGrade] = useState<Grade | ''>('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const listQ = useQuery({
    queryKey: ['admin', 'exams', { page, grade, q }],
    queryFn: () => adminExamsApi.list({ page, grade: grade || undefined, q: q.trim() || undefined }),
    placeholderData: (prev) => prev,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'exams'] });

  const createM = useMutation({
    mutationFn: (d: ExamPayload) => adminExamsApi.create(d),
    onSuccess: (exam) => {
      toast.success('تم إنشاء الامتحان — أضف الأسئلة الآن');
      invalidate();
      navigate(`/admin/exams/${exam.id}`);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const publishM = useMutation({
    mutationFn: ({ id, isPublished }: { id: number; isPublished: boolean }) => adminExamsApi.update(id, { isPublished }),
    onSuccess: (e) => {
      toast.success(e.isPublished ? 'تم نشر الامتحان' : 'تم إخفاء الامتحان');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const deleteM = useMutation({
    mutationFn: (id: number) => adminExamsApi.remove(id),
    onSuccess: () => {
      toast.success('تم حذف الامتحان');
      setDeleteId(null);
      invalidate();
    },
    onError: (e) => {
      toast.error(apiErrorMessage(e));
      setDeleteId(null);
    },
  });

  const data = listQ.data;
  return (
    <div>
      <PageTitle
        title="الامتحانات"
        subtitle="بنك الأسئلة، الامتحانات المؤقّتة بتصحيح تلقائي، وتحليلات النتائج."
        action={
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={18} /> امتحان جديد
          </button>
        }
      />

      <div className="mt-6 flex flex-wrap gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search size={17} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            className="input pr-11"
            placeholder="ابحث بالعنوان"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="input w-auto"
          value={grade}
          onChange={(e) => {
            setGrade(e.target.value as Grade | '');
            setPage(1);
          }}
        >
          <option value="">كل الصفوف</option>
          {Object.values(Grade).map((g) => (
            <option key={g} value={g}>
              {GRADE_LABELS[g]}
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
          <EmptyState icon={ClipboardList} title="لا توجد امتحانات" text="أنشئ أول امتحان ثم أضف أسئلة اختيار من متعدد أو صح/خطأ." />
        </div>
      ) : (
        <>
          <div className="card mt-6 overflow-x-auto">
            <table className="w-full min-w-[820px] text-right">
              <thead className="bg-paper-50">
                <tr className="border-b border-ink-900/[0.06] text-xs text-ink-400">
                  <th className="p-4 font-semibold">الامتحان</th>
                  <th className="p-4 font-semibold">الصف / الكورس</th>
                  <th className="p-4 font-semibold">الأسئلة</th>
                  <th className="p-4 font-semibold">المدة</th>
                  <th className="p-4 font-semibold">المحاولات</th>
                  <th className="p-4 font-semibold">الحالة</th>
                  <th className="p-4 font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id} className="border-b border-ink-900/[0.06] last:border-0 hover:bg-paper-50">
                    <td className="p-4">
                      <Link to={`/admin/exams/${e.id}`} className="font-semibold text-ink-800 hover:text-brand-600">
                        {e.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-400">
                        {e.startAt || e.endAt ? (
                          <span>
                            {e.startAt ? formatDateTime(e.startAt) : '—'} ← {e.endAt ? formatDateTime(e.endAt) : '—'}
                          </span>
                        ) : (
                          <span>متاح دائماً</span>
                        )}
                        {e.notifyParent && (
                          <span className="inline-flex items-center gap-1 text-brand-600">
                            <Bell size={12} /> ولي الأمر
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-sm text-ink-600">{e.courseTitle ?? GRADE_SHORT[e.grade]}</td>
                    <td className="whitespace-nowrap p-4 text-sm text-ink-600">
                      {e.questionsCount} · {e.totalPoints} درجة
                    </td>
                    <td className="whitespace-nowrap p-4 text-sm text-ink-600">{e.durationMin} د</td>
                    <td className="p-4 text-sm font-semibold text-ink-800 tabular-nums">
                      {e.attemptsCount}
                      {e.pendingGrading > 0 && (
                        <Link
                          to={`/admin/exams/${e.id}/analytics?grading=PENDING`}
                          className="tag ms-2 whitespace-nowrap bg-coral-100 text-coral-700 hover:bg-coral-200"
                        >
                          {e.pendingGrading} للتصحيح
                        </Link>
                      )}
                    </td>
                    <td className="p-4">
                      {e.isPublished ? (
                        <span className="tag bg-lime-200 text-ink-900">منشور</span>
                      ) : (
                        <span className="tag bg-paper-100 text-ink-500">مسودة</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1">
                        <Link
                          to={`/admin/exams/${e.id}`}
                          className="grid h-9 w-9 place-items-center rounded-full text-brand-600 hover:bg-brand-50"
                          title="الأسئلة والإعدادات"
                        >
                          <Settings2 size={18} />
                        </Link>
                        <Link
                          to={`/admin/exams/${e.id}/analytics`}
                          className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-paper-100"
                          title="التحليلات"
                        >
                          <BarChart3 size={18} />
                        </Link>
                        <button
                          type="button"
                          className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-paper-100 disabled:opacity-50"
                          onClick={() => publishM.mutate({ id: e.id, isPublished: !e.isPublished })}
                          disabled={publishM.isPending}
                          title={e.isPublished ? 'إخفاء' : 'نشر'}
                        >
                          {e.isPublished ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                        <button
                          type="button"
                          className="grid h-9 w-9 place-items-center rounded-full text-coral-600 hover:bg-coral-100 disabled:opacity-40"
                          onClick={() => setDeleteId(e.id)}
                          disabled={e.attemptsCount > 0}
                          title={e.attemptsCount > 0 ? 'له محاولات — أخفِه بدلاً من الحذف' : 'حذف'}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} totalPages={data.totalPages} total={data.total} onChange={setPage} />
        </>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="امتحان جديد" size="lg">
        <ExamForm onSubmit={(d) => createM.mutate(d)} onCancel={() => setCreating(false)} saving={createM.isPending} />
      </Modal>
      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId !== null && deleteM.mutate(deleteId)}
        title="حذف الامتحان"
        message="سيُحذف الامتحان وكل أسئلته نهائياً. هل أنت متأكد؟"
        loading={deleteM.isPending}
      />
    </div>
  );
}

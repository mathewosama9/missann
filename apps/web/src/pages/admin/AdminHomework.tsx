import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '../../components/ui/notify';
import { ClipboardCheck, FileText, Paperclip, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { AdminHomeworkDTO } from '@miss-ann/shared';
import { PageTitle } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pager } from '../../components/ui/Pager';
import { Modal, ConfirmDialog } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { HomeworkForm, type HomeworkFormResult } from '../../features/homework/HomeworkForm';
import { adminHomeworkApi } from '../../features/homework/api';
import { adminCoursesApi } from '../../features/courses/api';
import { apiErrorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

export function AdminHomework() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [courseId, setCourseId] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<AdminHomeworkDTO | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AdminHomeworkDTO | null>(null);

  const coursesQ = useQuery({
    queryKey: ['admin', 'courses', 'all'],
    queryFn: () => adminCoursesApi.list({ pageSize: 100 }),
  });
  const listQ = useQuery({
    queryKey: ['admin', 'homework', { page, courseId, q }],
    queryFn: () => adminHomeworkApi.list({ page, courseId: Number(courseId) || undefined, q: q.trim() || undefined }),
    placeholderData: (prev) => prev,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'homework'] });

  // الحفظ ثم المرفق: فشل رفع المرفق لا يلغي الواجب المحفوظ (يُعاد رفعه من التعديل)
  const saveM = useMutation({
    mutationFn: async ({ data, file, removeAttachment }: HomeworkFormResult) => {
      const { courseId: _courseId, ...changes } = data;
      let hw = editing && editing !== 'new' ? await adminHomeworkApi.update(editing.id, changes) : await adminHomeworkApi.create(data);
      if (removeAttachment) hw = await adminHomeworkApi.removeAttachment(hw.id);
      if (file) {
        try {
          hw = await adminHomeworkApi.setAttachment(hw.id, file);
        } catch (e) {
          toast.error(`تم حفظ الواجب، لكن تعذّر رفع المرفق: ${apiErrorMessage(e)}`);
        }
      }
      return hw;
    },
    onSuccess: () => {
      toast.success(editing === 'new' ? 'تم إنشاء الواجب' : 'تم حفظ التعديلات');
      setEditing(null);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
    onSettled: invalidate,
  });
  const deleteM = useMutation({
    mutationFn: (id: number) => adminHomeworkApi.remove(id),
    onSuccess: () => {
      toast.success('تم حذف الواجب');
      setDeleting(null);
      invalidate();
    },
    onError: (e) => {
      toast.error(apiErrorMessage(e));
      setDeleting(null);
    },
  });

  const data = listQ.data;
  const now = Date.now();
  return (
    <div>
      <PageTitle
        title="الواجبات"
        subtitle="واجبات لكل كورس أو حصة، وتصحيح حلول الطلاب بالدرجة والملاحظات."
        action={
          <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
            <Plus size={18} /> واجب جديد
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
          <EmptyState icon={FileText} title="لا توجد واجبات" text="أنشئي أول واجب لكورس أو حصة، وأرفقي ورقة الأسئلة PDF أو صورة." />
        </div>
      ) : (
        <>
          <div className="card mt-6 overflow-x-auto">
            <table className="w-full min-w-[820px] text-right">
              <thead className="bg-paper-50">
                <tr className="border-b border-ink-900/[0.06] text-xs text-ink-400">
                  <th className="p-4 font-semibold">الواجب</th>
                  <th className="p-4 font-semibold">الكورس / الحصة</th>
                  <th className="p-4 font-semibold">آخر موعد</th>
                  <th className="p-4 font-semibold">الدرجة</th>
                  <th className="p-4 font-semibold">التسليمات</th>
                  <th className="p-4 font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((h) => {
                  const pending = h.submissionsCount - h.gradedCount;
                  const overdue = h.dueAt !== null && Date.parse(h.dueAt) < now;
                  return (
                    <tr key={h.id} className="border-b border-ink-900/[0.06] last:border-0 hover:bg-paper-50">
                      <td className="p-4">
                        <Link to={`/admin/homework/${h.id}`} className="font-semibold text-ink-800 hover:text-brand-600">
                          {h.title}
                        </Link>
                        {h.attachment && (
                          <div className="mt-1 inline-flex items-center gap-1 text-xs text-ink-400">
                            <Paperclip size={12} /> {h.attachment.name}
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-sm text-ink-600">
                        {h.courseTitle}
                        {h.lessonTitle && <div className="text-xs text-ink-400">{h.lessonTitle}</div>}
                      </td>
                      <td className={`whitespace-nowrap p-4 text-sm ${overdue ? 'font-semibold text-coral-700' : 'text-ink-600'}`}>
                        {h.dueAt ? formatDateTime(h.dueAt) : 'بلا موعد'}
                      </td>
                      <td className="p-4 text-sm text-ink-600 tabular-nums">{h.maxGrade}</td>
                      <td className="p-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold text-ink-800 tabular-nums">{h.submissionsCount}</span>
                          {pending > 0 ? (
                            <span className="tag bg-paper-100 text-ink-600">{pending} للتصحيح</span>
                          ) : (
                            h.submissionsCount > 0 && <span className="tag bg-lime-200 text-ink-900">كلها مصحّحة</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <Link
                            to={`/admin/homework/${h.id}`}
                            className="grid h-9 w-9 place-items-center rounded-full text-brand-600 hover:bg-brand-50"
                            title="التسليمات والتصحيح"
                          >
                            <ClipboardCheck size={18} />
                          </Link>
                          <button
                            type="button"
                            className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-paper-100"
                            onClick={() => setEditing(h)}
                            title="تعديل"
                          >
                            <Pencil size={18} />
                          </button>
                          <button
                            type="button"
                            className="grid h-9 w-9 place-items-center rounded-full text-coral-600 hover:bg-coral-100"
                            onClick={() => setDeleting(h)}
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

      <Modal open={editing !== null} onClose={() => !saveM.isPending && setEditing(null)} title={editing === 'new' ? 'واجب جديد' : 'تعديل الواجب'} size="lg">
        {editing !== null && (
          <HomeworkForm
            key={editing === 'new' ? 'new' : editing.id}
            initial={editing === 'new' ? undefined : editing}
            onSubmit={(r) => saveM.mutate(r)}
            onCancel={() => setEditing(null)}
            saving={saveM.isPending}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteM.mutate(deleting.id)}
        title="حذف الواجب"
        message={
          deleting && deleting.submissionsCount > 0
            ? `سيُحذف الواجب مع ${deleting.submissionsCount} تسليم ودرجاتها وملفاتها نهائياً. هل أنت متأكدة؟`
            : 'سيُحذف الواجب ومرفقه نهائياً. هل أنت متأكدة؟'
        }
        loading={deleteM.isPending}
      />
    </div>
  );
}

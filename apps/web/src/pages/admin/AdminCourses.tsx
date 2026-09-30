import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '../../components/ui/notify';
import { Plus, Pencil, Trash2, Eye, EyeOff, Settings2, BookOpen } from 'lucide-react';
import {
  GRADE_SHORT,
  COURSE_TYPE_LABELS,
  formatEGP,
  type CourseCreateInput,
} from '@miss-ann/shared';
import { adminCoursesApi } from '../../features/courses/api';
import { apiErrorMessage } from '../../lib/api';
import { useAuth } from '../../store/auth';
import { CourseForm } from '../../features/courses/CourseForm';
import { Modal, ConfirmDialog } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';

export function AdminCourses() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  // حذف الكورس للأدمن فقط (الـ API يرفض المساعد بـ 403) ← الزر لا يظهر له
  const isAdmin = useAuth((s) => s.user?.role === 'ADMIN');

  const listQ = useQuery({
    queryKey: ['admin', 'courses'],
    queryFn: () => adminCoursesApi.list({ pageSize: 100 }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'courses'] });

  const createM = useMutation({
    mutationFn: (data: CourseCreateInput) => adminCoursesApi.create(data),
    onSuccess: () => {
      toast.success('تم إنشاء الكورس');
      setCreating(false);
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const publishM = useMutation({
    mutationFn: ({ id, isPublished }: { id: number; isPublished: boolean }) =>
      adminCoursesApi.publish(id, isPublished),
    onSuccess: (r) => {
      toast.success(r.message);
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const deleteM = useMutation({
    mutationFn: (id: number) => adminCoursesApi.remove(id),
    onSuccess: () => {
      toast.success('تم حذف الكورس');
      setDeleteId(null);
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const courses = listQ.data?.items ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-extrabold text-ink-900">الكورسات والحصص</h1>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={18} /> كورس جديد
        </button>
      </div>

      {listQ.isPending ? (
        <div className="grid place-items-center py-20">
          <Spinner className="h-8 w-8 text-brand-500" />
        </div>
      ) : courses.length === 0 ? (
        <div className="card mt-6 grid place-items-center gap-3 p-14 text-center text-ink-500">
          <BookOpen size={44} className="text-ink-300" />
          <p className="font-semibold">لا توجد كورسات بعد. ابدأ بإنشاء أول كورس.</p>
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={18} /> كورس جديد
          </button>
        </div>
      ) : (
        <div className="card mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-right">
            <thead className="bg-paper-50">
              <tr className="border-b border-ink-900/[0.06] text-xs text-ink-400">
                <th className="p-4 font-semibold">الكورس</th>
                <th className="p-4 font-semibold">الصف</th>
                <th className="p-4 font-semibold">النوع</th>
                <th className="p-4 font-semibold">السعر</th>
                <th className="p-4 font-semibold">الحصص</th>
                <th className="p-4 font-semibold">الحالة</th>
                <th className="p-4 font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id} className="border-b border-ink-900/[0.06] last:border-0 hover:bg-paper-50">
                  <td className="p-4 font-semibold text-ink-800">{c.title}</td>
                  <td className="p-4 text-sm text-ink-600">{GRADE_SHORT[c.grade]}</td>
                  <td className="p-4 text-sm text-ink-600">{COURSE_TYPE_LABELS[c.type]}</td>
                  <td className="p-4 text-sm font-semibold text-brand-600">
                    {c.price === 0 ? 'مجاني' : formatEGP(c.price)}
                  </td>
                  <td className="p-4 text-sm text-ink-600">{c.lessonsCount}</td>
                  <td className="p-4">
                    {c.isPublished ? (
                      <span className="rounded-full bg-lime-200 px-2.5 py-1 text-xs font-semibold text-ink-900">
                        منشور
                      </span>
                    ) : (
                      <span className="rounded-full bg-paper-100 px-2.5 py-1 text-xs font-semibold text-ink-500">
                        مسودة
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1">
                      <Link
                        to={`/admin/courses/${c.id}`}
                        className="grid h-9 w-9 place-items-center rounded-full text-brand-600 hover:bg-brand-50"
                        title="إدارة الحصص"
                      >
                        <Settings2 size={18} />
                      </Link>
                      <Link
                        to={`/admin/courses/${c.id}?edit=1`}
                        className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-paper-100"
                        title="تعديل"
                      >
                        <Pencil size={18} />
                      </Link>
                      <button
                        className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-paper-100 disabled:opacity-50"
                        onClick={() => publishM.mutate({ id: c.id, isPublished: !c.isPublished })}
                        disabled={publishM.isPending}
                        title={c.isPublished ? 'إخفاء' : 'نشر'}
                      >
                        {c.isPublished ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                      {isAdmin && (
                        <button
                          className="grid h-9 w-9 place-items-center rounded-full text-coral-600 hover:bg-coral-100"
                          onClick={() => setDeleteId(c.id)}
                          title="حذف"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="إنشاء كورس جديد" size="lg">
        <CourseForm
          onSubmit={(d) => createM.mutate(d)}
          onCancel={() => setCreating(false)}
          saving={createM.isPending}
        />
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId !== null && deleteM.mutate(deleteId)}
        title="حذف الكورس"
        message="سيتم حذف الكورس وكل حصصه ومرفقاته نهائياً. هل أنت متأكد؟"
        loading={deleteM.isPending}
      />
    </div>
  );
}

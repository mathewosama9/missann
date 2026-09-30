import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '../../components/ui/notify';
import {
  ArrowRight,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Paperclip,
  Eye,
  FileText,
  Video,
  UploadCloud,
} from 'lucide-react';
import {
  AttachmentType,
  formatEGP,
  GRADE_LABELS,
  type CourseCreateInput,
  type LessonCreateInput,
  type AdminLessonDTO,
} from '@miss-ann/shared';
import { adminCoursesApi } from '../../features/courses/api';
import { apiErrorMessage } from '../../lib/api';
import { CourseForm } from '../../features/courses/CourseForm';
import { Modal, ConfirmDialog } from '../../components/ui/Modal';
import { Field } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { VideoUploadModal } from '../../features/lessons/VideoUploadModal';

export function AdminCourseLessons() {
  const { id } = useParams();
  const courseId = Number(id);
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();

  const [editingCourse, setEditingCourse] = useState(params.get('edit') === '1');
  const [lessonModal, setLessonModal] = useState<{ open: boolean; lesson?: AdminLessonDTO }>({
    open: false,
  });
  const [deleteLessonId, setDeleteLessonId] = useState<number | null>(null);
  const [attachFor, setAttachFor] = useState<number | null>(null);
  const [videoFor, setVideoFor] = useState<number | null>(null);

  const courseQ = useQuery({
    queryKey: ['admin', 'course', courseId],
    queryFn: () => adminCoursesApi.detail(courseId),
    enabled: Number.isFinite(courseId),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'course', courseId] });

  const updateCourseM = useMutation({
    mutationFn: (data: CourseCreateInput) => adminCoursesApi.update(courseId, data),
    onSuccess: () => {
      toast.success('تم حفظ التعديلات');
      closeEdit();
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const addLessonM = useMutation({
    mutationFn: (data: LessonCreateInput) => adminCoursesApi.addLesson(courseId, data),
    onSuccess: () => {
      toast.success('تمت إضافة الحصة');
      setLessonModal({ open: false });
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const updateLessonM = useMutation({
    mutationFn: ({ lessonId, data }: { lessonId: number; data: Partial<LessonCreateInput> }) =>
      adminCoursesApi.updateLesson(lessonId, data),
    onSuccess: () => {
      toast.success('تم تحديث الحصة');
      setLessonModal({ open: false });
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const deleteLessonM = useMutation({
    mutationFn: (lessonId: number) => adminCoursesApi.removeLesson(lessonId),
    onSuccess: () => {
      toast.success('تم حذف الحصة');
      setDeleteLessonId(null);
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const reorderM = useMutation({
    mutationFn: (items: { id: number; order: number }[]) =>
      adminCoursesApi.reorderLessons(courseId, items),
    onSuccess: invalidate,
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const closeEdit = () => {
    setEditingCourse(false);
    if (params.get('edit')) {
      params.delete('edit');
      setParams(params, { replace: true });
    }
  };

  if (courseQ.isPending) {
    return (
      <div className="grid place-items-center py-20">
        <Spinner className="h-8 w-8 text-brand-500" />
      </div>
    );
  }

  if (courseQ.isError || !courseQ.data) {
    return (
      <div className="card p-10 text-center text-ink-500">
        الكورس غير موجود.{' '}
        <Link to="/admin/courses" className="font-bold text-brand-600">
          رجوع
        </Link>
      </div>
    );
  }

  const course = courseQ.data;
  const lessons = course.lessons;

  // تبديل حصتين متجاورتين ثم إعادة ترقيم الكل (0..n-1) — تبديل قيم order وحدها
  // لا يعمل إن تساوت (مثلاً بعد حذف حصة أو إضافة حصص بنفس الترتيب)
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= lessons.length) return;
    const next = [...lessons];
    [next[index], next[target]] = [next[target], next[index]];
    reorderM.mutate(next.map((l, i) => ({ id: l.id, order: i })));
  };

  return (
    <div>
      <Link to="/admin/courses" className="mb-4 inline-flex items-center gap-1 text-sm font-bold text-brand-600">
        <ArrowRight size={16} /> رجوع للكورسات
      </Link>

      {/* رأس الكورس */}
      <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-900">{course.title}</h1>
          <div className="mt-1 flex flex-wrap gap-3 text-sm text-ink-500">
            <span>{GRADE_LABELS[course.grade]}</span>
            <span>•</span>
            <span className="font-semibold text-brand-600">
              {course.price === 0 ? 'مجاني' : formatEGP(course.price)}
            </span>
            <span>•</span>
            <span>{course.isPublished ? 'منشور' : 'مسودة'}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/course/${course.id}`} target="_blank" className="btn-ghost">
            <Eye size={18} /> معاينة
          </Link>
          <button className="btn-primary" onClick={() => setEditingCourse(true)}>
            <Pencil size={18} /> تعديل الكورس
          </button>
        </div>
      </div>

      {/* الحصص */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-xl font-extrabold text-ink-900">الحصص ({lessons.length})</h2>
        <button className="btn-primary" onClick={() => setLessonModal({ open: true })}>
          <Plus size={18} /> حصة جديدة
        </button>
      </div>

      {lessons.length === 0 ? (
        <div className="card mt-4 p-10 text-center text-ink-500">لا توجد حصص بعد.</div>
      ) : (
        <ul className="mt-4 space-y-3">
          {lessons.map((lesson, idx) => (
            <li key={lesson.id} className="card p-4">
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <button
                    className="text-ink-300 hover:text-brand-500 disabled:opacity-30"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0 || reorderM.isPending}
                    aria-label="أعلى"
                  >
                    <ChevronUp size={18} />
                  </button>
                  <button
                    className="text-ink-300 hover:text-brand-500 disabled:opacity-30"
                    onClick={() => move(idx, 1)}
                    disabled={idx === lessons.length - 1 || reorderM.isPending}
                    aria-label="أسفل"
                  >
                    <ChevronDown size={18} />
                  </button>
                </div>

                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                  <Video size={18} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-ink-400">{idx + 1}.</span>
                    <h3 className="truncate font-bold text-ink-800">{lesson.title}</h3>
                    {lesson.isFreePreview && (
                      <span className="rounded-full bg-science-green/10 px-2 py-0.5 text-xs font-bold text-science-green">
                        معاينة
                      </span>
                    )}
                    {(lesson.videoProvider === 'YOUTUBE' ? lesson.youtubeVideoId : lesson.bunnyVideoId) ? (
                      <span className="rounded-full bg-ink-50 px-2 py-0.5 text-xs font-bold text-ink-600">
                        {lesson.videoProvider === 'YOUTUBE' ? 'يوتيوب' : 'Bunny'}
                      </span>
                    ) : (
                      <span className="rounded-full bg-coral-100 px-2 py-0.5 text-xs font-bold text-coral-700">
                        بدون فيديو
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-400">
                    {lesson.attachments.length} مرفق • {Math.round(lesson.durationSec / 60)} دقيقة
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    className="grid h-9 w-9 place-items-center rounded-full text-brand-600 hover:bg-brand-50"
                    onClick={() => setVideoFor(lesson.id)}
                    title="فيديو الحصة"
                  >
                    <UploadCloud size={17} />
                  </button>
                  <button
                    className="grid h-9 w-9 place-items-center rounded-full text-brand-600 hover:bg-brand-50"
                    onClick={() => setAttachFor(lesson.id)}
                    title="المرفقات"
                  >
                    <Paperclip size={17} />
                  </button>
                  <button
                    className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-paper-100"
                    onClick={() => setLessonModal({ open: true, lesson })}
                    title="تعديل"
                  >
                    <Pencil size={17} />
                  </button>
                  <button
                    className="grid h-9 w-9 place-items-center rounded-full text-coral-600 hover:bg-coral-100"
                    onClick={() => setDeleteLessonId(lesson.id)}
                    title="حذف"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>

              {/* المرفقات */}
              {lesson.attachments.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-ink-900/[0.08] pt-3 pr-14">
                  {lesson.attachments.map((att) => (
                    <li key={att.id} className="flex items-center gap-2 text-sm text-ink-600">
                      <FileText size={14} className="text-ink-400" />
                      <a href={att.url} target="_blank" rel="noreferrer" className="hover:text-brand-600">
                        {att.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* تعديل الكورس */}
      <Modal open={editingCourse} onClose={closeEdit} title="تعديل الكورس" size="lg">
        <CourseForm
          initial={course}
          onSubmit={(d) => updateCourseM.mutate(d)}
          onCancel={closeEdit}
          saving={updateCourseM.isPending}
        />
      </Modal>

      {/* إضافة/تعديل حصة */}
      <Modal
        open={lessonModal.open}
        onClose={() => setLessonModal({ open: false })}
        title={lessonModal.lesson ? 'تعديل الحصة' : 'حصة جديدة'}
      >
        <LessonForm
          initial={lessonModal.lesson}
          saving={addLessonM.isPending || updateLessonM.isPending}
          onCancel={() => setLessonModal({ open: false })}
          onSubmit={(data) =>
            lessonModal.lesson
              ? updateLessonM.mutate({ lessonId: lessonModal.lesson.id, data })
              : addLessonM.mutate({ ...data, order: lessons.length })
          }
        />
      </Modal>

      {/* مرفقات حصة */}
      <AttachmentsModal
        courseId={courseId}
        lesson={lessons.find((l) => l.id === attachFor)}
        onClose={() => setAttachFor(null)}
        onChanged={invalidate}
      />

      {/* رفع فيديو الحصة إلى Bunny */}
      <VideoUploadModal
        lesson={lessons.find((l) => l.id === videoFor)}
        onClose={() => setVideoFor(null)}
        onChanged={invalidate}
      />

      <ConfirmDialog
        open={deleteLessonId !== null}
        onClose={() => setDeleteLessonId(null)}
        onConfirm={() => deleteLessonId !== null && deleteLessonM.mutate(deleteLessonId)}
        title="حذف الحصة"
        message="سيتم حذف الحصة ومرفقاتها نهائياً. متأكد؟"
        loading={deleteLessonM.isPending}
      />
    </div>
  );
}

// ── فورم الحصة ────────────────────────────────────────────────────
interface LessonFormValues {
  title: string;
  durationMin: string;
  isFreePreview: boolean;
}

function LessonForm({
  initial,
  onSubmit,
  onCancel,
  saving,
}: {
  initial?: AdminLessonDTO;
  onSubmit: (data: LessonCreateInput) => void;
  onCancel: () => void;
  saving?: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LessonFormValues>({
    defaultValues: {
      title: initial?.title ?? '',
      durationMin: initial ? String(Math.round(initial.durationSec / 60)) : '',
      isFreePreview: initial?.isFreePreview ?? false,
    },
  });

  const submit = handleSubmit((v) =>
    onSubmit({
      title: v.title.trim(),
      order: initial?.order ?? 0,
      durationSec: (Number(v.durationMin) || 0) * 60,
      isFreePreview: v.isFreePreview,
    }),
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="عنوان الحصة" error={errors.title?.message}>
        <input
          className="input"
          {...register('title', { required: 'العنوان مطلوب', minLength: { value: 3, message: 'قصير جداً' } })}
        />
      </Field>
      <Field label="المدة (بالدقائق)">
        <input type="number" min={0} className="input" {...register('durationMin')} />
      </Field>
      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" className="h-4 w-4 rounded" {...register('isFreePreview')} />
        <span className="text-sm font-semibold text-ink-700">معاينة مجانية (متاحة لغير المشتركين)</span>
      </label>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={saving}>
          إلغاء
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Spinner /> : 'حفظ'}
        </button>
      </div>
    </form>
  );
}

// ── مرفقات الحصة ──────────────────────────────────────────────────
interface AttachmentFormValues {
  title: string;
  url: string;
  type: AttachmentType;
}

function AttachmentsModal({
  courseId,
  lesson,
  onClose,
  onChanged,
}: {
  courseId: number;
  lesson?: AdminLessonDTO;
  onClose: () => void;
  onChanged: () => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AttachmentFormValues>({
    defaultValues: { title: '', url: '', type: AttachmentType.PDF },
  });

  const addM = useMutation({
    mutationFn: (data: AttachmentFormValues) =>
      adminCoursesApi.addAttachment(lesson!.id, data),
    onSuccess: () => {
      toast.success('تمت إضافة المرفق');
      reset({ title: '', url: '', type: AttachmentType.PDF });
      onChanged();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const delM = useMutation({
    mutationFn: (attachmentId: number) => adminCoursesApi.removeAttachment(attachmentId),
    onSuccess: () => {
      toast.success('تم حذف المرفق');
      onChanged();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  void courseId; // المرفقات مرتبطة بالحصة مباشرة

  return (
    <Modal open={!!lesson} onClose={onClose} title={`مرفقات: ${lesson?.title ?? ''}`}>
      {lesson && (
        <>
          <ul className="mb-4 space-y-2">
            {lesson.attachments.length === 0 && (
              <li className="text-sm text-ink-400">لا توجد مرفقات بعد.</li>
            )}
            {lesson.attachments.map((att) => (
              <li
                key={att.id}
                className="flex items-center justify-between rounded-xl border border-ink-900/[0.08] p-2.5"
              >
                <a
                  href={att.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 truncate text-sm font-semibold text-ink-700 hover:text-brand-600"
                >
                  <FileText size={15} className="shrink-0 text-ink-400" /> {att.title}
                </a>
                <button
                  className="rounded-lg p-1.5 text-coral-600 hover:bg-coral-100"
                  onClick={() => delM.mutate(att.id)}
                  aria-label="حذف"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>

          <form
            onSubmit={handleSubmit((v) => addM.mutate(v))}
            className="space-y-3 border-t border-ink-900/[0.08] pt-4"
          >
            <Field label="عنوان المرفق" error={errors.title?.message}>
              <input className="input" {...register('title', { required: 'مطلوب' })} />
            </Field>
            <Field label="الرابط" error={errors.url?.message}>
              <input
                className="input"
                placeholder="https://..."
                {...register('url', { required: 'مطلوب' })}
              />
            </Field>
            <Field label="النوع">
              <select className="input" {...register('type')}>
                <option value={AttachmentType.PDF}>PDF</option>
                <option value={AttachmentType.FILE}>ملف</option>
              </select>
            </Field>
            <button type="submit" className="btn-primary w-full" disabled={addM.isPending}>
              {addM.isPending ? <Spinner /> : 'إضافة مرفق'}
            </button>
          </form>
        </>
      )}
    </Modal>
  );
}

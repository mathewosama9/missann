import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { FileText, Trash2 } from 'lucide-react';
import { HOMEWORK_MAX_GRADE_DEFAULT, UPLOAD_LIMITS, type AdminHomeworkDTO } from '@miss-ann/shared';
import { Field } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { adminCoursesApi } from '../courses/api';
import { fromLocalInput, toLocalInput } from '../../lib/format';
import { FileDropzone } from './FileDropzone';
import type { HomeworkPayload } from './api';

interface FormValues {
  courseId: string;
  lessonId: string;
  title: string;
  description: string;
  dueAt: string;
  maxGrade: string;
}

export interface HomeworkFormResult {
  data: HomeworkPayload;
  file: File | null; // مرفق جديد (يُرفع بعد الحفظ)
  removeAttachment: boolean;
}

// مرفق الواجب: PDF حتى 20MB (والصورة 5MB يُفحص في الخادم)
const ATTACHMENT_MAX = Math.max(UPLOAD_LIMITS.pdfMaxBytes, UPLOAD_LIMITS.imageMaxBytes);

export function HomeworkForm({
  initial,
  onSubmit,
  onCancel,
  saving,
}: {
  initial?: AdminHomeworkDTO;
  onSubmit: (r: HomeworkFormResult) => void;
  onCancel: () => void;
  saving?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const coursesQ = useQuery({
    queryKey: ['admin', 'courses', 'all'],
    queryFn: () => adminCoursesApi.list({ pageSize: 100 }),
  });
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      courseId: initial ? String(initial.courseId) : '',
      lessonId: initial?.lessonId ? String(initial.lessonId) : '',
      title: initial?.title ?? '',
      description: initial?.description ?? '',
      dueAt: toLocalInput(initial?.dueAt ?? null),
      maxGrade: String(initial?.maxGrade ?? HOMEWORK_MAX_GRADE_DEFAULT),
    },
  });
  const courseId = Number(watch('courseId')) || 0;
  // حصص الكورس المختار (نفس كاش صفحة حصص الكورس)
  const lessonsQ = useQuery({
    queryKey: ['admin', 'course', courseId],
    queryFn: () => adminCoursesApi.detail(courseId),
    enabled: courseId > 0,
  });

  const submit = handleSubmit((v) =>
    onSubmit({
      data: {
        // الحقل معطّل في التعديل (والكورس لا يتغيّر أصلاً)
        courseId: initial ? initial.courseId : Number(v.courseId),
        lessonId: v.lessonId ? Number(v.lessonId) : null,
        title: v.title.trim(),
        description: v.description.trim(),
        dueAt: fromLocalInput(v.dueAt),
        maxGrade: Number(v.maxGrade),
      },
      file,
      removeAttachment: removeAttachment && !file,
    }),
  );

  const existing = initial?.attachment && !removeAttachment ? initial.attachment : null;
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="عنوان الواجب" error={errors.title?.message}>
        <input
          className="input"
          placeholder="مثال: ارسمي الخلية النباتية وحدّدي أجزاءها"
          {...register('title', { required: 'العنوان مطلوب', minLength: { value: 3, message: 'قصير جداً' } })}
        />
      </Field>
      <Field label="المطلوب من الطالب (اختياري)">
        <textarea className="input min-h-24" maxLength={2000} {...register('description')} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الكورس" error={errors.courseId?.message} hint={initial ? 'لا يتغيّر بعد الإنشاء' : undefined}>
          <select
            className="input"
            disabled={!!initial}
            {...register('courseId', { required: 'اختاري الكورس', onChange: () => setValue('lessonId', '') })}
          >
            <option value="">اختاري الكورس</option>
            {coursesQ.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الحصة (اختياري)">
          <select className="input" disabled={!courseId} {...register('lessonId')}>
            <option value="">واجب عام للكورس</option>
            {lessonsQ.data?.lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="آخر موعد للتسليم (اختياري)">
          <input type="datetime-local" className="input" {...register('dueAt')} />
        </Field>
        <Field label="الدرجة النهائية" error={errors.maxGrade?.message}>
          <input
            type="number"
            inputMode="numeric"
            className="input"
            {...register('maxGrade', {
              required: 'مطلوب',
              validate: (v) => (Number.isInteger(Number(v)) && +v >= 1 && +v <= 100) || 'من 1 إلى 100',
            })}
          />
        </Field>
      </div>

      <div>
        <span className="label">ورقة الواجب (اختياري)</span>
        {existing && !file ? (
          <div className="flex items-center gap-3 rounded-3xl border border-ink-900/10 bg-paper-50 p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lime-300 text-ink-900">
              <FileText size={20} />
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold text-ink-900" dir="auto">
              {existing.name}
            </span>
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-full text-coral-600 hover:bg-coral-100"
              onClick={() => setRemoveAttachment(true)}
              aria-label="إزالة المرفق"
              title="إزالة المرفق"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ) : (
          <FileDropzone file={file} onChange={setFile} maxBytes={ATTACHMENT_MAX} disabled={saving} />
        )}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={saving}>
          إلغاء
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving && <Spinner />} {initial ? 'حفظ التعديلات' : 'إنشاء الواجب'}
        </button>
      </div>
    </form>
  );
}

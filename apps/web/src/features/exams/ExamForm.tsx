import { forwardRef } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import {
  Grade,
  GRADE_LABELS,
  RESULT_RELEASE_LABELS,
  ResultRelease,
  type AdminExamDetailDTO,
} from '@miss-ann/shared';
import { Field } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { adminCoursesApi } from '../courses/api';
import { fromLocalInput, toLocalInput } from '../../lib/format';
import type { ExamPayload } from './api';

interface FormValues {
  title: string;
  description: string;
  grade: Grade;
  courseId: string;
  durationMin: string;
  passScore: string;
  startAt: string;
  endAt: string;
  shuffle: boolean;
  resultRelease: ResultRelease;
  notifyParent: boolean;
}

const RELEASE_HINTS: Record<ResultRelease, string> = {
  IMMEDIATE: 'الدرجة والإجابات الصحيحة تظهر للطالب فور تسليمه (بعد تصحيحك لو فيه أسئلة كتابية).',
  AFTER_END: 'تظهر للجميع بعد موعد نهاية الامتحان — لا يرى أحد الإجابات وزملاؤه ما زالوا يمتحنون.',
  MANUAL: 'تظل مخفية حتى تضغطي «إعلان النتائج» من صفحة الامتحان.',
};


export function ExamForm({
  initial,
  onSubmit,
  onCancel,
  saving,
}: {
  initial?: AdminExamDetailDTO;
  onSubmit: (data: ExamPayload) => void;
  onCancel: () => void;
  saving?: boolean;
}) {
  const coursesQ = useQuery({
    queryKey: ['admin', 'courses', 'all'],
    queryFn: () => adminCoursesApi.list({ pageSize: 100 }),
  });
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      title: initial?.title ?? '',
      description: initial?.description ?? '',
      grade: initial?.grade ?? Grade.FOURTH_PRIMARY,
      courseId: initial?.courseId ? String(initial.courseId) : '',
      durationMin: String(initial?.durationMin ?? 20),
      passScore: String(initial?.passScore ?? 50),
      startAt: toLocalInput(initial?.startAt ?? null),
      endAt: toLocalInput(initial?.endAt ?? null),
      shuffle: initial?.shuffle ?? true,
      resultRelease: initial?.resultRelease ?? ResultRelease.MANUAL,
      notifyParent: initial?.notifyParent ?? true,
    },
  });
  const courseId = watch('courseId');
  const startAt = watch('startAt');
  const endAt = watch('endAt');
  const resultRelease = watch('resultRelease');

  const submit = handleSubmit((v) => {
    const course = coursesQ.data?.items.find((c) => String(c.id) === v.courseId);
    onSubmit({
      title: v.title.trim(),
      description: v.description.trim(),
      courseId: v.courseId ? Number(v.courseId) : null,
      // امتحان الكورس يأخذ صف الكورس (الخادم يفرض ذلك أيضاً)
      grade: course?.grade ?? v.grade,
      durationMin: Number(v.durationMin),
      passScore: Number(v.passScore),
      startAt: fromLocalInput(v.startAt),
      endAt: fromLocalInput(v.endAt),
      shuffle: v.shuffle,
      resultRelease: v.resultRelease,
      notifyParent: v.notifyParent,
      isPublished: initial?.isPublished ?? false,
    });
  });

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="عنوان الامتحان" error={errors.title?.message}>
        <input
          className="input"
          placeholder="مثال: كويز الوحدة الأولى — المادة وخواصها"
          {...register('title', { required: 'العنوان مطلوب', minLength: { value: 3, message: 'قصير جداً' } })}
        />
      </Field>
      <Field label="وصف قصير (اختياري)">
        <textarea className="input min-h-20" maxLength={1000} {...register('description')} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الكورس" hint="اتركه «امتحان عام» ليظهر لكل طلاب الصف">
          <select className="input" {...register('courseId')}>
            <option value="">امتحان عام للصف</option>
            {coursesQ.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الصف">
          <select className="input" disabled={!!courseId} {...register('grade')}>
            {Object.values(Grade).map((g) => (
              <option key={g} value={g}>
                {GRADE_LABELS[g]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="المدة (دقيقة)" error={errors.durationMin?.message}>
          <input
            type="number"
            inputMode="numeric"
            className="input"
            {...register('durationMin', {
              required: 'مطلوب',
              validate: (v) => (Number.isInteger(Number(v)) && +v >= 1 && +v <= 300) || 'من 1 إلى 300 دقيقة',
            })}
          />
        </Field>
        <Field label="نسبة النجاح %" error={errors.passScore?.message}>
          <input
            type="number"
            inputMode="numeric"
            className="input"
            {...register('passScore', {
              required: 'مطلوب',
              validate: (v) => (Number.isInteger(Number(v)) && +v >= 0 && +v <= 100) || 'من 0 إلى 100',
            })}
          />
        </Field>
        <Field label="يبدأ في (اختياري)">
          <input type="datetime-local" className="input" {...register('startAt')} />
        </Field>
        <Field label="ينتهي في (اختياري)" error={errors.endAt?.message}>
          <input
            type="datetime-local"
            className="input"
            {...register('endAt', {
              validate: (v) => !v || !startAt || new Date(v) > new Date(startAt) || 'يجب أن يكون بعد البداية',
            })}
          />
        </Field>
      </div>

      <Field label="متى تظهر الدرجة والتصحيح للطالب؟" error={errors.resultRelease?.message}>
        <select
          className="input"
          {...register('resultRelease', {
            validate: (v) => v !== ResultRelease.AFTER_END || !!endAt || 'حدّدي موعد النهاية أولاً',
          })}
        >
          {Object.values(ResultRelease).map((r) => (
            <option key={r} value={r}>
              {RESULT_RELEASE_LABELS[r]}
            </option>
          ))}
        </select>
      </Field>
      <p className="-mt-2 text-xs leading-5 text-ink-500">{RELEASE_HINTS[resultRelease]}</p>
      {resultRelease === ResultRelease.IMMEDIATE && !endAt && (
        <p className="flex items-start gap-2 rounded-2xl bg-coral-100 p-3 text-xs leading-5 text-coral-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          الامتحان بلا موعد نهاية: من يسلّم أولاً يرى الإجابات الصحيحة وقد ينقلها لزملائه. الأفضل «بعد انتهاء موعد الامتحان».
        </p>
      )}

      <fieldset className="space-y-2 rounded-3xl border border-ink-900/10 bg-paper-50 p-4">
        <Toggle label="خلط ترتيب الأسئلة لكل طالب" {...register('shuffle')} />
        <Toggle label="إرسال الدرجة لولي الأمر تلقائياً بعد التسليم" {...register('notifyParent')} />
      </fieldset>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={saving}>
          إلغاء
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving && <Spinner />} {initial ? 'حفظ الإعدادات' : 'إنشاء الامتحان'}
        </button>
      </div>
    </form>
  );
}

const Toggle = forwardRef<HTMLInputElement, { label: string } & React.InputHTMLAttributes<HTMLInputElement>>(
  function Toggle({ label, ...props }, ref) {
    return (
      <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-ink-700">
        <input ref={ref} type="checkbox" className="h-5 w-5 accent-brand-500" {...props} />
        {label}
      </label>
    );
  },
);

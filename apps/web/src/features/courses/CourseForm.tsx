import { useForm } from 'react-hook-form';
import {
  Grade,
  CourseType,
  Term,
  GRADE_LABELS,
  COURSE_TYPE_LABELS,
  TERM_LABELS,
  egpToPiastres,
  piastresToEGP,
  type CourseCreateInput,
  type AdminCourseDTO,
} from '@miss-ann/shared';
import { Field } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';

interface FormValues {
  title: string;
  description: string;
  grade: Grade;
  type: CourseType;
  term: '' | Term;
  month: string;
  priceEGP: string;
  coverImage: string;
  order: string;
}

interface Props {
  initial?: AdminCourseDTO;
  onSubmit: (data: CourseCreateInput) => void;
  onCancel: () => void;
  saving?: boolean;
}

export function CourseForm({ initial, onSubmit, onCancel, saving }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      title: initial?.title ?? '',
      description: initial?.description ?? '',
      grade: initial?.grade ?? Grade.FOURTH_PRIMARY,
      type: initial?.type ?? CourseType.MONTHLY,
      term: initial?.term ?? '',
      month: initial?.month != null ? String(initial.month) : '',
      priceEGP: initial ? String(piastresToEGP(initial.price)) : '',
      coverImage: initial?.coverImage ?? '',
      order: initial?.order != null ? String(initial.order) : '0',
    },
  });

  const submit = handleSubmit((v) => {
    onSubmit({
      title: v.title.trim(),
      description: v.description.trim(),
      grade: v.grade,
      type: v.type,
      term: v.term === '' ? null : v.term,
      month: v.month === '' ? null : Number(v.month),
      price: egpToPiastres(Number(v.priceEGP) || 0),
      coverImage: v.coverImage.trim() === '' ? null : v.coverImage.trim(),
      order: Number(v.order) || 0,
      isPublished: initial?.isPublished ?? false,
    });
  });

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="عنوان الكورس" error={errors.title?.message}>
        <input
          className="input"
          {...register('title', { required: 'العنوان مطلوب', minLength: { value: 3, message: 'قصير جداً' } })}
        />
      </Field>

      <Field label="الوصف" error={errors.description?.message}>
        <textarea
          rows={4}
          className="input resize-none"
          {...register('description', { required: 'الوصف مطلوب', minLength: { value: 3, message: 'قصير جداً' } })}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الصف">
          <select className="input" {...register('grade')}>
            {Object.values(Grade).map((g) => (
              <option key={g} value={g}>
                {GRADE_LABELS[g]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="النوع">
          <select className="input" {...register('type')}>
            {Object.values(CourseType).map((t) => (
              <option key={t} value={t}>
                {COURSE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="الترم (اختياري)">
          <select className="input" {...register('term')}>
            <option value="">— بدون —</option>
            {Object.values(Term).map((t) => (
              <option key={t} value={t}>
                {TERM_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="الشهر (اختياري)" hint="رقم من 1 إلى 12">
          <input type="number" min={1} max={12} className="input" {...register('month')} />
        </Field>

        <Field label="السعر (بالجنيه)" error={errors.priceEGP?.message} hint="0 = مجاني">
          <input
            type="number"
            min={0}
            step="0.01"
            className="input"
            {...register('priceEGP', { min: { value: 0, message: 'قيمة غير صحيحة' } })}
          />
        </Field>

        <Field label="الترتيب" hint="الأصغر يظهر أولاً">
          <input type="number" className="input" {...register('order')} />
        </Field>
      </div>

      <Field label="رابط صورة الغلاف (اختياري)">
        <input type="url" className="input" placeholder="https://..." {...register('coverImage')} />
      </Field>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={saving}>
          إلغاء
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Spinner /> : initial ? 'حفظ التعديلات' : 'إنشاء الكورس'}
        </button>
      </div>
    </form>
  );
}

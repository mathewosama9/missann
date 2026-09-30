import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import {
  isAllowedJoinUrl,
  LIVE_JOIN_EARLY_MIN,
  LIVE_PROVIDER_HOSTS,
  LIVE_PROVIDER_LABELS,
  LiveProvider,
  type AdminLiveSessionDTO,
} from '@miss-ann/shared';
import { Field } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { adminCoursesApi } from '../courses/api';
import { fromLocalInput, toLocalInput } from '../../lib/format';
import type { LivePayload } from './api';

interface FormValues {
  courseId: string;
  title: string;
  provider: LiveProvider;
  joinUrl: string;
  startAt: string;
  durationMin: string;
}

export function LiveForm({
  initial,
  onSubmit,
  onCancel,
  saving,
}: {
  initial?: AdminLiveSessionDTO;
  onSubmit: (data: LivePayload) => void;
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
      courseId: initial ? String(initial.courseId) : '',
      title: initial?.title ?? '',
      provider: initial?.provider ?? LiveProvider.ZOOM,
      joinUrl: initial?.joinUrl ?? '',
      startAt: toLocalInput(initial?.startAt ?? null),
      durationMin: String(initial?.durationMin ?? 60),
    },
  });
  const provider = watch('provider');

  const submit = handleSubmit((v) =>
    onSubmit({
      courseId: initial ? initial.courseId : Number(v.courseId),
      title: v.title.trim(),
      provider: v.provider,
      joinUrl: v.joinUrl.trim(),
      startAt: fromLocalInput(v.startAt)!,
      durationMin: Number(v.durationMin),
    }),
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="عنوان الحصة" error={errors.title?.message}>
        <input
          className="input"
          placeholder="مثال: مراجعة الوحدة الأولى — لايف"
          {...register('title', { required: 'العنوان مطلوب', minLength: { value: 3, message: 'قصير جداً' } })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الكورس" error={errors.courseId?.message} hint={initial ? 'لا يتغيّر بعد الإنشاء' : 'تظهر لمشتركي الكورس فقط'}>
          <select className="input" disabled={!!initial} {...register('courseId', { required: 'اختاري الكورس' })}>
            <option value="">اختاري الكورس</option>
            {coursesQ.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="المنصة">
          <select className="input" {...register('provider')}>
            {Object.values(LiveProvider).map((p) => (
              <option key={p} value={p}>
                {LIVE_PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الموعد" error={errors.startAt?.message}>
          <input
            type="datetime-local"
            className="input"
            {...register('startAt', {
              required: 'حدّدي الموعد',
              validate: (v) =>
                (initial && v === toLocalInput(initial.startAt)) || new Date(v).getTime() > Date.now() || 'الموعد يجب أن يكون في المستقبل',
            })}
          />
        </Field>
        <Field label="المدة (دقيقة)" error={errors.durationMin?.message}>
          <input
            type="number"
            inputMode="numeric"
            className="input"
            {...register('durationMin', {
              required: 'مطلوب',
              validate: (v) => (Number.isInteger(Number(v)) && +v >= 10 && +v <= 600) || 'من 10 إلى 600 دقيقة',
            })}
          />
        </Field>
      </div>
      <Field label="رابط الانضمام" error={errors.joinUrl?.message}>
        <input
          className="input"
          dir="ltr"
          inputMode="url"
          placeholder={provider === LiveProvider.MEET ? 'https://meet.google.com/abc-defg-hij' : 'https://zoom.us/j/123456789'}
          {...register('joinUrl', {
            required: 'الرابط مطلوب',
            validate: (v) => isAllowedJoinUrl(v.trim(), provider) || `رابط ${LIVE_PROVIDER_LABELS[provider]} فقط (https://${LIVE_PROVIDER_HOSTS[provider][0]}/…)`,
          })}
        />
      </Field>
      <p className="-mt-2 flex items-start gap-2 text-xs leading-5 text-ink-500">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-brand-500" />
        الرابط لا يظهر للطلاب إلا قبل الحصة بـ {LIVE_JOIN_EARLY_MIN} دقيقة، ولمشتركي الكورس فقط.
      </p>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={saving}>
          إلغاء
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving && <Spinner />} {initial ? 'حفظ التعديلات' : 'جدولة الحصة'}
        </button>
      </div>
    </form>
  );
}

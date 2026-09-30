import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Megaphone, Send } from 'lucide-react';
import {
  BROADCAST_AUDIENCE_LABELS,
  BroadcastAudience,
  CUSTOM_TEMPLATE_VARS,
  GRADE_LABELS,
  Grade,
  renderTemplate,
  TEMPLATE_BODY_MAX,
  templateVarErrors,
  type AdminBroadcastDTO,
  type BroadcastInput,
} from '@miss-ann/shared';
import { toast } from '../../components/ui/notify';
import { Field } from '../../components/ui/Field';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pager } from '../../components/ui/Pager';
import { Spinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/Modal';
import { adminCoursesApi } from '../courses/api';
import { apiErrorFields, apiErrorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { adminNotificationsApi } from './api';

interface FormValues {
  title: string;
  body: string;
  audience: BroadcastAudience;
  grade: string;
  courseId: string;
  alsoWhatsapp: boolean;
}

const varsError = (field: 'title' | 'body') => (v: string) =>
  templateVarErrors(CUSTOM_TEMPLATE_VARS, [], { title: '', body: '', [field]: v })[field] ?? true;

function toInput(v: FormValues): BroadcastInput {
  return {
    title: v.title.trim(),
    body: v.body.trim(),
    audience: v.audience,
    ...(v.audience === 'GRADE' && { grade: v.grade as Grade }),
    ...(v.audience === 'COURSE' && { courseId: Number(v.courseId) }),
    alsoWhatsapp: v.alsoWhatsapp,
  };
}

// ── نموذج الإرسال الجماعي + سجل الإرسالات ─────────────────────────
export function BroadcastPanel() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<BroadcastInput | null>(null);
  const coursesQ = useQuery({ queryKey: ['admin', 'courses', 'all'], queryFn: () => adminCoursesApi.list({ pageSize: 100 }) });
  const templatesQ = useQuery({ queryKey: ['admin', 'notif-templates'], queryFn: adminNotificationsApi.templates });
  const historyQ = useQuery({
    queryKey: ['admin', 'broadcasts', page],
    queryFn: () => adminNotificationsApi.broadcasts(page),
    placeholderData: (prev) => prev,
    // تحديث تلقائي فقط أثناء توزيع بث لم يكتمل
    refetchInterval: (q) => (q.state.data?.items.some((b) => !b.completedAt) ? 3000 : false),
  });

  const { register, handleSubmit, watch, setValue, setError, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: { title: '', body: '', audience: 'COURSE', grade: '', courseId: '', alsoWhatsapp: false },
  });
  const [audience, body, title] = watch(['audience', 'body', 'title']);

  const sendM = useMutation({
    mutationFn: adminNotificationsApi.broadcast,
    onSuccess: () => {
      toast.success('تم الحفظ — جارٍ التوزيع على الطلاب');
      setPending(null);
      reset();
      setPage(1);
      void qc.invalidateQueries({ queryKey: ['admin', 'broadcasts'] });
    },
    onError: (e) => {
      setPending(null);
      const fields = apiErrorFields(e);
      if (fields) for (const [k, m] of Object.entries(fields)) setError(k as keyof FormValues, { message: m });
      toast.error(apiErrorMessage(e));
    },
  });

  const customTemplates = (templatesQ.data ?? []).filter((t) => !t.isSystem && t.channel === 'IN_APP');
  const courses = coursesQ.data?.items ?? [];
  const audienceText = (v: BroadcastInput) =>
    v.audience === 'GRADE'
      ? `طلاب ${GRADE_LABELS[v.grade!]}`
      : v.audience === 'COURSE'
        ? `مشتركي «${courses.find((c) => c.id === v.courseId)?.title ?? ''}» (الاشتراكات السارية)`
        : 'كل الطلاب المفعّلين';

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
      <form onSubmit={handleSubmit((v) => setPending(toInput(v)))} className="card space-y-4 p-5 sm:p-6">
        <h2 className="font-display text-xl font-extrabold text-ink-900">رسالة جديدة</h2>
        {customTemplates.length > 0 && (
          <Field label="من قالب جاهز (اختياري)">
            <select
              className="input"
              defaultValue=""
              onChange={(e) => {
                const t = customTemplates.find((x) => x.key === e.target.value);
                if (t) {
                  setValue('title', t.title, { shouldValidate: true });
                  setValue('body', t.body, { shouldValidate: true });
                }
              }}
            >
              <option value="">— بدون قالب —</option>
              {customTemplates.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.title || t.key}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="العنوان" error={errors.title?.message}>
          <input className="input" maxLength={160} placeholder="مثال: تغيير موعد حصة المراجعة" {...register('title', { required: 'العنوان مطلوب', minLength: { value: 2, message: 'قصير جداً' }, validate: varsError('title') })} />
        </Field>
        <Field label="نص الرسالة" error={errors.body?.message} hint={`يمكنك كتابة {name} ليظهر اسم الطالب — ${body.length}/${TEMPLATE_BODY_MAX}`}>
          <textarea className="input min-h-[120px]" maxLength={TEMPLATE_BODY_MAX} {...register('body', { required: 'النص مطلوب', minLength: { value: 2, message: 'قصير جداً' }, validate: varsError('body') })} />
        </Field>
        <Field label="إلى">
          <select className="input" {...register('audience')}>
            {Object.values(BroadcastAudience).map((a) => (
              <option key={a} value={a}>
                {BROADCAST_AUDIENCE_LABELS[a]}
              </option>
            ))}
          </select>
        </Field>
        {audience === 'GRADE' && (
          <Field label="الصف" error={errors.grade?.message}>
            <select className="input" {...register('grade', { required: 'اختر الصف' })}>
              <option value="">اختر الصف</option>
              {Object.values(Grade).map((g) => (
                <option key={g} value={g}>
                  {GRADE_LABELS[g]}
                </option>
              ))}
            </select>
          </Field>
        )}
        {audience === 'COURSE' && (
          <Field label="الكورس" error={errors.courseId?.message} hint="تصل لأصحاب الاشتراكات السارية فقط">
            <select className="input" {...register('courseId', { required: 'اختر الكورس' })}>
              <option value="">اختر الكورس</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        <label className="flex items-start gap-3 rounded-2xl border border-ink-900/10 bg-paper-50 p-3 text-sm text-ink-700">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-500" {...register('alsoWhatsapp')} />
          <span>
            إرسال على واتساب أيضاً
            <span className="block text-xs text-ink-400">رسالة لكل طالب على رقمه (لها تكلفة لدى المزوّد)، وSMS بديل عند الفشل.</span>
          </span>
        </label>
        {(title || body) && (
          <div className="rounded-2xl border border-dashed border-ink-900/15 p-3">
            <div className="text-xs font-semibold text-ink-400">معاينة (لطالب اسمه «أحمد»)</div>
            <div className="mt-1 break-words text-sm font-semibold text-ink-900">{renderTemplate(title, { name: 'أحمد' })}</div>
            <div className="mt-1 whitespace-pre-line break-words text-sm text-ink-600">{renderTemplate(body, { name: 'أحمد' })}</div>
          </div>
        )}
        <button type="submit" className="btn-primary w-full" disabled={sendM.isPending}>
          <Send size={18} /> إرسال
        </button>
      </form>

      <div className="min-w-0">
        <h2 className="font-display text-xl font-extrabold text-ink-900">الإرسالات السابقة</h2>
        {historyQ.isPending ? (
          <div className="grid place-items-center py-16">
            <Spinner className="h-8 w-8 text-brand-500" />
          </div>
        ) : !historyQ.data || historyQ.data.items.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={Megaphone} title="لا توجد إرسالات بعد" text="الرسائل الجماعية التي ترسلها تظهر هنا مع حالة توصيلها." />
          </div>
        ) : (
          <>
            <div className="mt-4 space-y-3">
              {historyQ.data.items.map((b) => (
                <BroadcastCard key={b.id} b={b} />
              ))}
            </div>
            <Pager page={historyQ.data.page} totalPages={historyQ.data.totalPages} total={historyQ.data.total} onChange={setPage} />
          </>
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => !sendM.isPending && setPending(null)}
        onConfirm={() => pending && sendM.mutate(pending)}
        title="تأكيد الإرسال"
        message={pending ? `ستصل الرسالة إلى ${audienceText(pending)}${pending.alsoWhatsapp ? '\nوعلى واتساب أيضاً.' : '.'}\nلا يمكن التراجع بعد الإرسال.` : ''}
        loading={sendM.isPending}
        confirmLabel="إرسال الآن"
        loadingLabel="جارٍ الإرسال..."
        tone="primary"
      />
    </div>
  );
}

function BroadcastCard({ b }: { b: AdminBroadcastDTO }) {
  const target =
    b.audience === 'GRADE' ? GRADE_LABELS[b.grade!] : b.audience === 'COURSE' ? (b.courseTitle ?? 'كورس محذوف') : BROADCAST_AUDIENCE_LABELS.ALL;
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="break-words font-semibold text-ink-900">{b.title}</div>
          <div className="mt-1 text-xs text-ink-400">{formatDateTime(b.createdAt)}</div>
        </div>
        {b.completedAt ? (
          <span className="tag bg-lime-200 text-ink-900">
            <CheckCircle2 size={14} /> وصلت لـ {b.recipients} طالب
          </span>
        ) : (
          <span className="tag bg-brand-50 text-brand-700">
            <Loader2 size={14} className="animate-spin" /> جارٍ التوزيع
          </span>
        )}
      </div>
      <p className="mt-2 line-clamp-2 whitespace-pre-line break-words text-sm text-ink-600">{b.body}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="tag bg-paper-100 text-ink-600">{target}</span>
        {b.alsoWhatsapp && (
          <>
            <span className="tag bg-lime-200 text-ink-900">واتساب: {b.messages.SENT} أُرسلت</span>
            {b.messages.PENDING > 0 && <span className="tag bg-brand-50 text-brand-700">{b.messages.PENDING} قيد الإرسال</span>}
            {b.messages.FAILED > 0 && <span className="tag bg-coral-100 text-coral-700">{b.messages.FAILED} فشلت</span>}
          </>
        )}
      </div>
    </div>
  );
}

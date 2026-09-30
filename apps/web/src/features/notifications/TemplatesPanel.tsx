import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  NOTIF_CHANNEL_LABELS,
  TEMPLATE_BODY_MAX,
  TEMPLATE_CHANNELS,
  TEMPLATE_KEY_RE,
  templateVarErrors,
  type NotificationTemplateDTO,
  type TemplateChannel,
} from '@miss-ann/shared';
import { toast } from '../../components/ui/notify';
import { Field } from '../../components/ui/Field';
import { Modal, ConfirmDialog } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { apiErrorFields, apiErrorMessage } from '../../lib/api';
import { adminNotificationsApi } from './api';

type Editing = NotificationTemplateDTO | 'new' | null;

// ── قوالب الرسائل: نصوص النظام (تعديل/استعادة) + قوالب مخصّصة للإرسال الجماعي ──
export function TemplatesPanel() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<NotificationTemplateDTO | null>(null);
  const q = useQuery({ queryKey: ['admin', 'notif-templates'], queryFn: adminNotificationsApi.templates });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'notif-templates'] });

  const removeM = useMutation({
    mutationFn: (t: NotificationTemplateDTO) => adminNotificationsApi.deleteTemplate(t.key, t.channel),
    onSuccess: (r) => {
      toast.success(r.message);
      setRemoving(null);
      void invalidate();
    },
    onError: (e) => {
      toast.error(apiErrorMessage(e));
      setRemoving(null);
    },
  });

  const items = q.data ?? [];
  const system = items.filter((t) => t.isSystem);
  const custom = items.filter((t) => !t.isSystem);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">المتغيّرات بين أقواس مثل {'{name}'} تُستبدل تلقائياً — المسموح لكل قالب مذكور تحته.</p>
        <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
          <Plus size={18} /> قالب مخصّص
        </button>
      </div>

      {q.isPending ? (
        <div className="grid place-items-center py-16">
          <Spinner className="h-8 w-8 text-brand-500" />
        </div>
      ) : (
        <>
          <h3 className="mt-6 font-display text-lg font-extrabold text-ink-900">رسائل النظام</h3>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {system.map((t) => (
              <TemplateCard key={`${t.key}:${t.channel}`} t={t} onEdit={() => setEditing(t)} onRemove={t.isCustomized ? () => setRemoving(t) : undefined} />
            ))}
          </div>
          <h3 className="mt-8 font-display text-lg font-extrabold text-ink-900">قوالب مخصّصة</h3>
          {custom.length === 0 ? (
            <div className="mt-3">
              <EmptyState icon={FileText} title="لا توجد قوالب مخصّصة" text="أنشئ رسائل جاهزة تختارها بسرعة عند الإرسال الجماعي." />
            </div>
          ) : (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {custom.map((t) => (
                <TemplateCard key={`${t.key}:${t.channel}`} t={t} onEdit={() => setEditing(t)} onRemove={() => setRemoving(t)} />
              ))}
            </div>
          )}
        </>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'قالب مخصّص جديد' : 'تعديل القالب'} size="lg">
        {editing !== null && (
          <TemplateForm
            key={editing === 'new' ? 'new' : `${editing.key}:${editing.channel}`}
            initial={editing === 'new' ? undefined : editing}
            onDone={() => {
              setEditing(null);
              void invalidate();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && removeM.mutate(removing)}
        title={removing?.isSystem ? 'استعادة النص الافتراضي' : 'حذف القالب'}
        message={removing?.isSystem ? 'سيُحذف تعديلك ويعود القالب لنصه الافتراضي.' : 'سيُحذف القالب المخصّص نهائياً.'}
        confirmLabel={removing?.isSystem ? 'استعادة' : undefined}
        loading={removeM.isPending}
      />
    </div>
  );
}

function TemplateCard({ t, onEdit, onRemove }: { t: NotificationTemplateDTO; onEdit: () => void; onRemove?: () => void }) {
  return (
    <div className="card flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-ink-900">{t.label}</div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
            <span className={`tag ${t.channel === 'WHATSAPP' ? 'bg-lime-200 text-ink-900' : 'bg-paper-100 text-ink-600'}`}>{NOTIF_CHANNEL_LABELS[t.channel]}</span>
            <span className="tag bg-paper-100 font-mono text-ink-500" dir="ltr">{t.key}</span>
            {t.isCustomized && <span className="tag bg-brand-50 text-brand-700">معدّل</span>}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-paper-100" onClick={onEdit} title="تعديل">
            <Pencil size={17} />
          </button>
          {onRemove && (
            <button type="button" className="grid h-9 w-9 place-items-center rounded-full text-coral-600 hover:bg-coral-100" onClick={onRemove} title={t.isSystem ? 'استعادة الافتراضي' : 'حذف'}>
              {t.isSystem ? <RotateCcw size={17} /> : <Trash2 size={17} />}
            </button>
          )}
        </div>
      </div>
      {t.title && <div className="mt-3 break-words text-sm font-semibold text-ink-800">{t.title}</div>}
      <p className="mt-1 whitespace-pre-line break-words text-sm text-ink-600">{t.body}</p>
      <div className="mt-3 text-xs text-ink-400" dir="ltr">
        {t.vars.map((v) => `{${v}}`).join(' ')}
      </div>
    </div>
  );
}

interface FormValues {
  key: string;
  channel: TemplateChannel;
  title: string;
  body: string;
}

function TemplateForm({ initial, onDone, onCancel }: { initial?: NotificationTemplateDTO; onDone: () => void; onCancel: () => void }) {
  const vars = initial?.vars ?? ['name'];
  const required = initial?.required ?? [];
  const { register, handleSubmit, setError, formState: { errors } } = useForm<FormValues>({
    defaultValues: { key: initial?.key ?? '', channel: initial?.channel ?? 'IN_APP', title: initial?.title ?? '', body: initial?.body ?? '' },
  });
  const check = (field: 'title' | 'body') => (v: string, all: FormValues) =>
    templateVarErrors(vars, required, { ...all, [field]: v })[field] ?? true;

  const saveM = useMutation({
    mutationFn: (v: FormValues) => {
      const content = { title: v.title.trim(), body: v.body.trim() };
      return initial
        ? adminNotificationsApi.saveTemplate(initial.key, initial.channel, content)
        : adminNotificationsApi.createTemplate({ key: v.key.trim(), channel: v.channel, ...content });
    },
    onSuccess: () => {
      toast.success('تم حفظ القالب');
      onDone();
    },
    onError: (e) => {
      const fields = apiErrorFields(e);
      if (fields) for (const [k, m] of Object.entries(fields)) setError(k as keyof FormValues, { message: m });
      toast.error(apiErrorMessage(e));
    },
  });

  return (
    <form onSubmit={handleSubmit((v) => saveM.mutate(v))} className="space-y-4">
      {!initial && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="المفتاح (بالإنجليزية)" error={errors.key?.message} hint="مثال: exam_reminder">
            <input className="input" dir="ltr" {...register('key', { required: 'المفتاح مطلوب', pattern: { value: TEMPLATE_KEY_RE, message: 'حروف إنجليزية صغيرة وأرقام و _ (3–40)' } })} />
          </Field>
          <Field label="القناة" error={errors.channel?.message}>
            <select className="input" {...register('channel')}>
              {TEMPLATE_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {NOTIF_CHANNEL_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      <Field label="العنوان" error={errors.title?.message}>
        <input className="input" maxLength={160} {...register('title', { validate: check('title') })} />
      </Field>
      <Field
        label="النص"
        error={errors.body?.message}
        hint={`المسموح: ${vars.map((v) => `{${v}}`).join(' ')}${required.length ? ` — الإلزامي: ${required.map((v) => `{${v}}`).join(' ')}` : ''}`}
      >
        <textarea className="input min-h-[140px]" maxLength={TEMPLATE_BODY_MAX} {...register('body', { required: 'النص مطلوب', validate: check('body') })} />
      </Field>
      <div className="flex justify-end gap-3">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={saveM.isPending}>
          إلغاء
        </button>
        <button type="submit" className="btn-primary" disabled={saveM.isPending}>
          {saveM.isPending ? 'جارٍ الحفظ...' : 'حفظ'}
        </button>
      </div>
    </form>
  );
}

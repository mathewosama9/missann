import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Power, UserPlus, Users } from 'lucide-react';
import { ROLE_LABELS, staffCreateSchema, type StaffCreateInput, type StaffDTO } from '@miss-ann/shared';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { Spinner } from '../../components/ui/Spinner';
import { toast } from '../../components/ui/notify';
import { apiErrorFields, apiErrorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { adminApi, adminKeys } from './api';
import { ActiveTag } from './ActiveTag';
import { TempPasswordModal } from './TempPasswordModal';

// المساعدون: يصلون للكورسات والامتحانات والتصحيح والواجبات واللايف فقط (الإيراد والطلاب والإعدادات للأدمن)
const ASSISTANT_SCOPE = 'المساعد يقدر: يدير الكورسات والحصص، الامتحانات والتصحيح، الواجبات، والحصص اللايف. مايقدرش يشوف الإيراد أو بيانات الطلاب أو يبعت رسائل جماعية.';

type Confirm = { kind: 'status' | 'reset'; staff: StaffDTO } | null;

export function StaffPanel() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [temp, setTemp] = useState<{ name: string; password: string } | null>(null);
  const staffQ = useQuery({ queryKey: adminKeys.staff, queryFn: adminApi.staff });
  const refresh = () => void qc.invalidateQueries({ queryKey: adminKeys.staff });
  const onError = (e: unknown) => toast.error(apiErrorMessage(e));

  const statusM = useMutation({
    mutationFn: (s: StaffDTO) => adminApi.setStaffActive(s.id, !s.isActive),
    onSuccess: (_r, s) => {
      toast.success(s.isActive ? 'تم تعطيل المساعد' : 'تم تفعيل المساعد');
      setConfirm(null);
      refresh();
    },
    onError,
  });
  const resetM = useMutation({
    mutationFn: (s: StaffDTO) => adminApi.resetStaffPassword(s.id),
    // كلمة المرور المؤقتة لا تبقى في كاش الـ mutations بعد مغادرة الصفحة
    gcTime: 0,
    onSuccess: (r, s) => {
      setConfirm(null);
      setTemp({ name: s.name, password: r.tempPassword });
    },
    onError,
  });

  const items = staffQ.data ?? [];
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm leading-7 text-ink-500">{ASSISTANT_SCOPE}</p>
        <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
          <UserPlus size={18} /> إضافة مساعد
        </button>
      </div>

      {staffQ.isPending ? (
        <SkeletonRows rows={3} className="h-16" />
      ) : staffQ.isError ? (
        <div className="card p-8 text-center text-coral-600">{apiErrorMessage(staffQ.error)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Users} title="لا يوجد فريق عمل" text="أضف مساعداً ليساعد في التصحيح والمتابعة." />
      ) : (
        <ul className="space-y-2">
          {items.map((s) => (
            <li key={s.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink-900">{s.name}</span>
                  <span className="rounded-full bg-paper-100 px-2 py-0.5 text-xs text-ink-600">{ROLE_LABELS[s.role]}</span>
                  <ActiveTag active={s.isActive} />
                </div>
                <div className="mt-1 text-xs text-ink-400">
                  <span dir="ltr">{s.phone}</span> · منذ {formatDate(s.createdAt)}
                </div>
              </div>
              {/* حسابات الأدمن لا تُعدَّل من هنا */}
              {s.role === 'ASSISTANT' && (
                <div className="flex gap-2">
                  <button type="button" className="btn-ghost py-2" onClick={() => setConfirm({ kind: 'reset', staff: s })}>
                    <KeyRound size={16} /> كلمة جديدة
                  </button>
                  <button type="button" className="btn-ghost py-2" onClick={() => setConfirm({ kind: 'status', staff: s })}>
                    <Power size={16} /> {s.isActive ? 'تعطيل' : 'تفعيل'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <AddAssistantModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(name, password) => {
          setAdding(false);
          setTemp({ name, password });
          refresh();
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === 'status'}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && statusM.mutate(confirm.staff)}
        loading={statusM.isPending}
        title={confirm?.staff.isActive ? 'تعطيل المساعد' : 'تفعيل المساعد'}
        message={confirm?.staff.isActive ? `${confirm.staff.name} مش هيقدر يدخل، وهيتسجّل خروجه فوراً.` : `${confirm?.staff.name ?? ''} هيقدر يدخل تاني.`}
        confirmLabel={confirm?.staff.isActive ? 'تعطيل' : 'تفعيل'}
        loadingLabel="جارٍ الحفظ..."
        tone={confirm?.staff.isActive ? 'danger' : 'primary'}
      />
      <ConfirmDialog
        open={confirm?.kind === 'reset'}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && resetM.mutate(confirm.staff)}
        loading={resetM.isPending}
        title="كلمة مرور جديدة"
        message={`هتتعمل كلمة مؤقتة جديدة لـ ${confirm?.staff.name ?? ''} وتظهر لك مرة واحدة، وهيتسجّل خروجه من كل الأجهزة.`}
        confirmLabel="إنشاء كلمة جديدة"
        loadingLabel="جارٍ الإنشاء..."
        tone="primary"
      />
      <TempPasswordModal password={temp?.password ?? null} name={temp?.name ?? ''} onClose={() => setTemp(null)} />
    </section>
  );
}

function AddAssistantModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (name: string, password: string) => void }) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<StaffCreateInput>({ resolver: zodResolver(staffCreateSchema) });
  const createM = useMutation({
    mutationFn: adminApi.createAssistant,
    // كلمة المرور المؤقتة لا تبقى في كاش الـ mutations بعد مغادرة الصفحة
    gcTime: 0,
    onSuccess: (r) => {
      reset();
      onCreated(r.staff.name, r.tempPassword);
    },
    onError: (e) => {
      const fields = apiErrorFields(e);
      if (fields) for (const [k, m] of Object.entries(fields)) setError(k as keyof StaffCreateInput, { message: m });
      else toast.error(apiErrorMessage(e));
    },
  });
  return (
    <Modal open={open} onClose={onClose} title="إضافة مساعد">
      <form className="space-y-4" onSubmit={handleSubmit((v) => createM.mutate(v))} noValidate>
        <div>
          <label className="label" htmlFor="staff-name">الاسم</label>
          <input id="staff-name" className="input" {...register('name')} />
          {errors.name && <p className="mt-1 text-xs text-coral-600">{errors.name.message}</p>}
        </div>
        <div>
          <label className="label" htmlFor="staff-phone">الموبايل (للدخول)</label>
          <input id="staff-phone" className="input" dir="ltr" inputMode="numeric" placeholder="01xxxxxxxxx" {...register('phone')} />
          {errors.phone && <p className="mt-1 text-xs text-coral-600">{errors.phone.message}</p>}
        </div>
        <div>
          <label className="label" htmlFor="staff-email">البريد (اختياري)</label>
          <input id="staff-email" className="input" dir="ltr" type="email" {...register('email')} />
          {errors.email && <p className="mt-1 text-xs text-coral-600">{errors.email.message}</p>}
        </div>
        <p className="text-xs text-ink-400">هتتعمل كلمة مرور مؤقتة تظهر لك مرة واحدة بعد الإضافة.</p>
        <div className="flex justify-end gap-3">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={createM.isPending}>
            إلغاء
          </button>
          <button type="submit" className="btn-primary" disabled={createM.isPending}>
            {createM.isPending ? <Spinner /> : <UserPlus size={16} />} إضافة
          </button>
        </div>
      </form>
    </Modal>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { ConfirmDialog } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/notify';
import { apiErrorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { adminApi, adminKeys } from './api';

// إعداد التحقق من الموبايل عند التسجيل — إيقافه يحتاج تأكيداً لأنه يُضعف الحماية
export function PlatformSettingsPanel() {
  const qc = useQueryClient();
  const [confirmOff, setConfirmOff] = useState(false);
  const settingsQ = useQuery({ queryKey: adminKeys.settings, queryFn: adminApi.settings });
  const saveM = useMutation({
    mutationFn: adminApi.saveSettings,
    onSuccess: (s) => {
      qc.setQueryData(adminKeys.settings, s);
      setConfirmOff(false);
      toast.success(s.requirePhoneVerification ? 'التسجيل يتطلب كود تحقق الآن' : 'التسجيل بدون كود تحقق الآن');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const s = settingsQ.data;

  if (settingsQ.isError) return <div className="card p-8 text-center text-coral-600">{apiErrorMessage(settingsQ.error)}</div>;
  if (!s) return <Skeleton className="h-44 rounded-4xl" />;

  const on = s.requirePhoneVerification;
  return (
    <section className="card max-w-2xl p-6">
      <div className="flex items-start gap-4">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${on ? 'bg-lime-300 text-ink-900' : 'bg-coral-300 text-ink-900'}`}>
          {on ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-extrabold text-ink-900">التحقق من رقم الموبايل عند التسجيل</h2>
          <p className="mt-1 text-sm leading-7 text-ink-500">
            {on
              ? 'مفعّل: الطالب الجديد يستلم كود على واتساب/SMS ولازم يدخله قبل ما يقدر يدخل المنصة.'
              : 'متوقف: الحساب الجديد يتفعّل فوراً من غير كود. أي حد يقدر يسجّل برقم مش بتاعه، ورسائل ولي الأمر ممكن تروح لرقم غلط.'}
          </p>
          <label className="mt-4 inline-flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              role="switch"
              className="peer sr-only"
              checked={on}
              disabled={saveM.isPending}
              onChange={(e) => (e.target.checked ? saveM.mutate({ requirePhoneVerification: true }) : setConfirmOff(true))}
            />
            <span className="relative h-7 w-12 rounded-full bg-ink-200 transition after:absolute after:right-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:bg-lime-400 peer-checked:after:-translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400" />
            <span className="text-sm font-semibold text-ink-800">{on ? 'التحقق مفعّل' : 'التحقق متوقف'}</span>
          </label>
          <p className="mt-3 text-xs text-ink-400">
            آخر تعديل {formatDateTime(s.updatedAt)}
            {s.updatedBy && ` بواسطة ${s.updatedBy.name}`}. استعادة كلمة المرور تحتاج كود دائماً (أو كلمة جديدة من صفحة الطالب).
          </p>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        onConfirm={() => saveM.mutate({ requirePhoneVerification: false })}
        loading={saveM.isPending}
        title="إيقاف التحقق؟"
        message="الحسابات الجديدة هتتفعّل فوراً من غير ما نتأكد إن الرقم بتاع صاحبه. تقدر ترجّعه في أي وقت."
        confirmLabel="إيقاف التحقق"
        loadingLabel="جارٍ الحفظ..."
      />
    </section>
  );
}

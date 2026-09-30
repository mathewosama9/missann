import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '../../components/ui/notify';
import { Trash2, Smartphone } from 'lucide-react';
import { api, apiErrorMessage } from '../../lib/api';
import { useAuth } from '../../store/auth';
import { Field } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';

interface Device {
  id: number;
  userAgent: string;
  ip: string;
  lastSeen: string;
}

export function Profile() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');

  const devicesQ = useQuery({
    queryKey: ['devices'],
    queryFn: () => api.get<{ devices: Device[] }>('/auth/devices').then((r) => r.data.devices),
  });

  const removeDevice = useMutation({
    mutationFn: (id: number) => api.delete(`/auth/devices/${id}`),
    onSuccess: () => {
      toast.success('تم إزالة الجهاز');
      qc.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const changePass = useMutation({
    mutationFn: () =>
      api.post('/auth/change-password', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      toast.success('تم تغيير كلمة المرور');
      setCurrent('');
      setNext('');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl font-extrabold text-ink-900">الملف الشخصي</h1>

      <div className="card mt-6 grid gap-4 p-6 sm:grid-cols-2">
        <Info label="الاسم" value={user?.name} />
        <Info label="الموبايل" value={user?.phone} />
        <Info label="البريد" value={user?.email ?? '—'} />
        <Info label="المحافظة" value={user?.governorate} />
      </div>

      {/* تغيير كلمة المرور */}
      <div className="card mt-6 p-6">
        <h2 className="font-extrabold text-ink-900">تغيير كلمة المرور</h2>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            changePass.mutate();
          }}
        >
          <Field label="كلمة المرور الحالية">
            <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="كلمة المرور الجديدة">
            <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <button className="btn-primary" disabled={changePass.isPending || next.length < 8}>
              {changePass.isPending ? <Spinner /> : 'حفظ'}
            </button>
          </div>
        </form>
      </div>

      {/* الأجهزة المرتبطة */}
      <div className="card mt-6 p-6">
        <h2 className="font-extrabold text-ink-900">الأجهزة المرتبطة</h2>
        <p className="mt-1 text-sm text-ink-500">أزل جهازاً للسماح بتسجيل الدخول من جهاز جديد.</p>
        <div className="mt-4 space-y-2">
          {devicesQ.isLoading && <Spinner className="text-brand-500" />}
          {devicesQ.data?.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-2xl border border-ink-900/[0.06] p-3">
              <div className="flex items-center gap-3">
                <Smartphone className="text-brand-500" size={20} />
                <div>
                  <div className="text-sm font-semibold text-ink-700">
                    {d.userAgent?.slice(0, 40) || 'جهاز غير معروف'}
                  </div>
                  <div className="text-xs text-ink-400">
                    آخر ظهور: {new Date(d.lastSeen).toLocaleString('ar-EG')}
                  </div>
                </div>
              </div>
              <button
                className="grid h-9 w-9 place-items-center rounded-full text-coral-600 hover:bg-coral-100"
                onClick={() => removeDevice.mutate(d.id)}
                aria-label="إزالة"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
          {devicesQ.data?.length === 0 && <p className="text-sm text-ink-400">لا توجد أجهزة مسجّلة.</p>}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs text-ink-400">{label}</div>
      <div className="font-semibold text-ink-800">{value}</div>
    </div>
  );
}

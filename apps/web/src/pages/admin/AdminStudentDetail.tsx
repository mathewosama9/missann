import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, KeyRound, MonitorSmartphone, Power, Star, Trash2, UserX } from 'lucide-react';
import { ENROLLMENT_SOURCE_LABELS, GRADE_LABELS, formatEGP, type UserDeviceDTO } from '@miss-ann/shared';
import { PageTitle } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { ConfirmDialog } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/notify';
import { apiErrorMessage } from '../../lib/api';
import { formatDate, formatDateTime, formatRelative } from '../../lib/format';
import { adminApi, adminKeys } from '../../features/admin/api';
import { ActiveTag } from '../../features/admin/ActiveTag';
import { TempPasswordModal } from '../../features/admin/TempPasswordModal';

// وصف مختصر للجهاز من user-agent (للتعرّف عليه فقط — ليس للأمان)
function deviceLabel(ua: string): string {
  if (!ua) return 'جهاز غير معروف';
  const os = /Android/i.test(ua) ? 'أندرويد' : /iPhone|iPad|iOS/i.test(ua) ? 'آيفون/آيباد' : /Windows/i.test(ua) ? 'ويندوز' : /Mac OS/i.test(ua) ? 'ماك' : /Linux/i.test(ua) ? 'لينكس' : '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [browser, os].filter(Boolean).join(' — ') || 'متصفح';
}

type Confirm = { kind: 'status' } | { kind: 'reset' } | { kind: 'device'; device: UserDeviceDTO } | null;

export function AdminStudentDetail() {
  const id = Number(useParams().id);
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const studentQ = useQuery({ queryKey: adminKeys.student(id), queryFn: () => adminApi.student(id), enabled: Number.isInteger(id) && id > 0 });
  const s = studentQ.data;

  // أي تعديل ← تحديث التفاصيل والقائمة معاً
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin', 'students'] });
  const onError = (e: unknown) => toast.error(apiErrorMessage(e));
  const statusM = useMutation({
    mutationFn: () => adminApi.setStudentActive(id, !s!.isActive),
    onSuccess: () => {
      toast.success(s!.isActive ? 'تم تعطيل الحساب وتسجيل خروجه' : 'تم تفعيل الحساب');
      setConfirm(null);
      refresh();
    },
    onError,
  });
  const resetM = useMutation({
    mutationFn: () => adminApi.resetStudentPassword(id),
    // كلمة المرور المؤقتة لا تبقى في كاش الـ mutations بعد مغادرة الصفحة
    gcTime: 0,
    onSuccess: (r) => {
      setConfirm(null);
      setTempPassword(r.tempPassword);
    },
    onError,
  });
  const deviceM = useMutation({
    mutationFn: (deviceId: number) => adminApi.removeStudentDevice(id, deviceId),
    onSuccess: (r) => {
      toast.success(r.message);
      setConfirm(null);
      refresh();
    },
    onError,
  });

  const back = (
    <Link to="/admin/students" className="btn-ghost">
      <ArrowRight size={16} /> كل الطلاب
    </Link>
  );

  if (studentQ.isError || !Number.isInteger(id) || id <= 0) {
    return (
      <div className="space-y-6">
        <PageTitle title="الطالب" action={back} />
        <EmptyState icon={UserX} title="الطالب غير موجود" text={studentQ.error ? apiErrorMessage(studentQ.error) : 'رابط غير صحيح'} />
      </div>
    );
  }
  if (!s) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 rounded-4xl" />
        <Skeleton className="h-60 rounded-4xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageTitle title={s.name} subtitle={s.grade ? GRADE_LABELS[s.grade] : 'بدون صف'} action={back} />

      {/* البيانات والإجراءات */}
      <section className="card grid gap-5 p-5 lg:grid-cols-[1fr_auto]">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Info label="الموبايل" value={<span dir="ltr">{s.phone}</span>} />
          <Info label="موبايل ولي الأمر" value={<span dir="ltr">{s.parentPhone || '—'}</span>} />
          <Info label="البريد" value={<span dir="ltr" className="break-all">{s.email ?? '—'}</span>} />
          <Info label="المحافظة" value={s.governorate || '—'} />
          <Info label="الرصيد" value={<span className="font-semibold text-brand-600">{formatEGP(s.balance)}</span>} />
          <Info label="التسجيل" value={formatDate(s.createdAt)} />
          <Info label="الحالة" value={<ActiveTag active={s.isActive} />} />
          <Info
            label="النجوم"
            value={
              <span className="inline-flex items-center gap-1">
                <Star size={14} className="fill-science-yellow text-science-yellow" /> {s.stars}
              </span>
            }
          />
        </dl>
        <div className="flex flex-wrap items-start gap-2 lg:flex-col">
          <button type="button" className={s.isActive ? 'btn bg-coral-500 text-white hover:bg-coral-600' : 'btn-primary'} onClick={() => setConfirm({ kind: 'status' })}>
            <Power size={16} /> {s.isActive ? 'تعطيل الحساب' : 'تفعيل الحساب'}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setConfirm({ kind: 'reset' })}>
            <KeyRound size={16} /> كلمة مرور جديدة
          </button>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* الأجهزة */}
        <section className="card p-5">
          <h2 className="font-display text-lg font-extrabold text-ink-900">
            الأجهزة ({s.devices.length}/{s.deviceLimit})
          </h2>
          <p className="mt-1 text-xs text-ink-400">إزالة جهاز تفتح مكاناً لجهاز جديد وتسجّل خروج الطالب من كل أجهزته.</p>
          {s.devices.length === 0 ? (
            <p className="mt-6 text-center text-sm text-ink-400">لم يسجّل الدخول من أي جهاز بعد</p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-900/[0.06]">
              {s.devices.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <MonitorSmartphone size={18} className="shrink-0 text-ink-400" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink-800">{deviceLabel(d.userAgent)}</div>
                      <div className="text-xs text-ink-400">
                        آخر ظهور {formatRelative(d.lastSeen)} · أول دخول {formatDate(d.createdAt)}
                      </div>
                    </div>
                  </div>
                  <button type="button" className="btn-icon h-9 w-9 shrink-0 text-coral-600" onClick={() => setConfirm({ kind: 'device', device: d })} aria-label="إزالة الجهاز">
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* الاشتراكات */}
        <section className="card p-5">
          <h2 className="font-display text-lg font-extrabold text-ink-900">الاشتراكات</h2>
          {s.enrollments.length === 0 ? (
            <p className="mt-6 text-center text-sm text-ink-400">لا توجد اشتراكات</p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-900/[0.06]">
              {s.enrollments.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink-800">{e.courseTitle}</div>
                    <div className="text-xs text-ink-400">
                      {ENROLLMENT_SOURCE_LABELS[e.source]} · {formatDate(e.createdAt)}
                    </div>
                  </div>
                  <div className="shrink-0 text-left text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${e.active ? 'bg-lime-200 text-ink-900' : 'bg-paper-100 text-ink-500'}`}>
                      {e.active ? 'ساري' : 'منتهي'}
                    </span>
                    <div className="mt-1 text-ink-400">حتى {formatDate(e.expiresAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* آخر الامتحانات */}
      <section className="card p-5">
        <h2 className="font-display text-lg font-extrabold text-ink-900">آخر الامتحانات</h2>
        {s.recentAttempts.length === 0 ? (
          <p className="mt-6 text-center text-sm text-ink-400">لم يدخل أي امتحان بعد</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink-900/[0.06]">
            {s.recentAttempts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <Link to={`/admin/exams/${a.examId}/attempts/${a.id}`} className="min-w-0 truncate text-sm font-semibold text-ink-800 hover:text-brand-600">
                  {a.examTitle}
                </Link>
                <div className="shrink-0 text-left text-sm">
                  <span className="font-semibold tabular-nums text-ink-900">{a.score === null ? 'قيد التصحيح' : `${a.score}/${a.totalPoints}`}</span>
                  {a.submittedAt && <div className="text-xs text-ink-400">{formatDateTime(a.submittedAt)}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={confirm?.kind === 'status'}
        onClose={() => setConfirm(null)}
        onConfirm={() => statusM.mutate()}
        loading={statusM.isPending}
        title={s.isActive ? 'تعطيل الحساب' : 'تفعيل الحساب'}
        message={s.isActive ? `${s.name} مش هيقدر يدخل المنصة، وهيتسجّل خروجه من كل أجهزته فوراً.` : `${s.name} هيقدر يدخل المنصة تاني.`}
        confirmLabel={s.isActive ? 'تعطيل' : 'تفعيل'}
        loadingLabel="جارٍ الحفظ..."
        tone={s.isActive ? 'danger' : 'primary'}
      />
      <ConfirmDialog
        open={confirm?.kind === 'reset'}
        onClose={() => setConfirm(null)}
        onConfirm={() => resetM.mutate()}
        loading={resetM.isPending}
        title="كلمة مرور جديدة"
        message={`هيتعمل لـ ${s.name} كلمة مرور مؤقتة جديدة تظهر لك مرة واحدة، والقديمة هتبطل، وهيتسجّل خروجه من كل الأجهزة.`}
        confirmLabel="إنشاء كلمة جديدة"
        loadingLabel="جارٍ الإنشاء..."
        tone="primary"
      />
      <ConfirmDialog
        open={confirm?.kind === 'device'}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm?.kind === 'device' && deviceM.mutate(confirm.device.id)}
        loading={deviceM.isPending}
        title="إزالة الجهاز"
        message={`هيتشال "${confirm?.kind === 'device' ? deviceLabel(confirm.device.userAgent) : ''}" من أجهزة الطالب، ويتسجّل خروجه من كل الأجهزة عشان يدخل من جديد.`}
        confirmLabel="إزالة"
        loadingLabel="جارٍ الإزالة..."
      />
      <TempPasswordModal password={tempPassword} name={s.name} onClose={() => setTempPassword(null)} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className="mt-0.5 text-ink-800">{value}</dd>
    </div>
  );
}

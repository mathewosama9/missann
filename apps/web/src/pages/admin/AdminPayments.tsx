import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from '../../components/ui/notify';
import { CreditCard, Wallet, UserPlus, Search, UserCheck } from 'lucide-react';
import {
  PAYMENT_STATUS_LABELS,
  egpToPiastres,
  formatEGP,
  type PaymentPurpose,
  type PaymentStatus,
} from '@miss-ann/shared';
import { PageTitle } from '../../components/ui/StatCard';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { apiErrorMessage } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/format';
import { adminFinanceApi, type StudentLookup } from '../../features/wallet/api';
import { adminCoursesApi } from '../../features/courses/api';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pager } from '../../components/ui/Pager';

const STATUS_TAG: Record<PaymentStatus, string> = {
  PENDING: 'bg-paper-100 text-ink-600',
  PAID: 'bg-lime-200 text-ink-900',
  FAILED: 'bg-coral-100 text-coral-600',
};

const PURPOSE_LABELS: Record<PaymentPurpose, string> = { TOPUP: 'شحن محفظة', COURSE: 'اشتراك كورس' };

export function AdminPayments() {
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const [purpose, setPurpose] = useState<PaymentPurpose | ''>('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<'topup' | 'enroll' | null>(null);

  const paymentsQ = useQuery({
    queryKey: ['admin', 'payments', status, purpose, page],
    queryFn: () => adminFinanceApi.payments({ status: status || undefined, purpose: purpose || undefined, page }),
    placeholderData: keepPreviousData,
  });
  const data = paymentsQ.data;

  return (
    <div className="space-y-6">
      <PageTitle
        title="المدفوعات والمحافظ"
        subtitle="سجل الدفع الأونلاين (Paymob) وعمليات الشحن والاشتراك اليدوية."
        action={
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => setModal('enroll')}>
              <UserPlus size={18} /> اشتراك يدوي
            </button>
            <button className="btn-primary" onClick={() => setModal('topup')}>
              <Wallet size={18} /> شحن يدوي
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <select
          className="input w-auto py-2"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as PaymentStatus | '');
            setPage(1);
          }}
          aria-label="الحالة"
        >
          <option value="">كل الحالات</option>
          {(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map((s) => (
            <option key={s} value={s}>
              {PAYMENT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          className="input w-auto py-2"
          value={purpose}
          onChange={(e) => {
            setPurpose(e.target.value as PaymentPurpose | '');
            setPage(1);
          }}
          aria-label="الغرض"
        >
          <option value="">كل الأغراض</option>
          {(Object.keys(PURPOSE_LABELS) as PaymentPurpose[]).map((p) => (
            <option key={p} value={p}>
              {PURPOSE_LABELS[p]}
            </option>
          ))}
        </select>
      </div>

      {paymentsQ.isPending ? (
        <div className="grid place-items-center py-16">
          <Spinner className="h-8 w-8 text-brand-500" />
        </div>
      ) : paymentsQ.isError ? (
        <div className="card p-8 text-center text-coral-600">{apiErrorMessage(paymentsQ.error)}</div>
      ) : !data?.items.length ? (
        <EmptyState icon={CreditCard} title="لا توجد مدفوعات" text="ستظهر هنا عمليات الدفع الأونلاين فور بدئها." />
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[820px] text-right">
              <thead className="bg-paper-50">
                <tr className="border-b border-ink-900/[0.06] text-xs text-ink-400">
                  <th className="p-4 font-semibold">#</th>
                  <th className="p-4 font-semibold">الطالب</th>
                  <th className="p-4 font-semibold">الغرض</th>
                  <th className="p-4 font-semibold">المبلغ</th>
                  <th className="p-4 font-semibold">الحالة</th>
                  <th className="p-4 font-semibold">رقم الطلب</th>
                  <th className="p-4 font-semibold">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id} className="border-b border-ink-900/[0.06] last:border-0 hover:bg-paper-50">
                    <td className="p-4 text-sm text-ink-400">{p.id}</td>
                    <td className="p-4 text-sm">
                      <div className="font-semibold text-ink-800">{p.user.name}</div>
                      <div className="text-xs text-ink-400" dir="ltr">{p.user.phone}</div>
                    </td>
                    <td className="p-4 text-sm text-ink-600">
                      {PURPOSE_LABELS[p.purpose]}
                      {p.courseTitle && <div className="truncate text-xs text-ink-400">{p.courseTitle}</div>}
                    </td>
                    <td className="p-4 text-sm font-semibold text-brand-600">{formatEGP(p.amount)}</td>
                    <td className="p-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TAG[p.status]}`}>
                        {PAYMENT_STATUS_LABELS[p.status]}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-xs text-ink-500" dir="ltr">{p.providerRef ?? '—'}</td>
                    <td className="p-4 text-sm text-ink-500">
                      {formatDateTime(p.createdAt)}
                      {p.paidAt && <div className="text-xs text-ink-400">دُفع {formatDateTime(p.paidAt)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} totalPages={data.totalPages} total={data.total} onChange={setPage} />
        </>
      )}

      <TopupModal open={modal === 'topup'} onClose={() => setModal(null)} />
      <EnrollModal open={modal === 'enroll'} onClose={() => setModal(null)} />
    </div>
  );
}

// ── بحث طالب بالموبايل (تأكيد الاسم قبل أي عملية) ────────────────
function StudentPicker({ student, onFound }: { student: StudentLookup | null; onFound: (s: StudentLookup | null) => void }) {
  const [phone, setPhone] = useState('');
  const lookupM = useMutation({
    mutationFn: () => adminFinanceApi.lookup(phone.trim()),
    onSuccess: onFound,
    onError: (e) => {
      onFound(null);
      toast.error(apiErrorMessage(e));
    },
  });

  return (
    <div>
      <label className="label" htmlFor="student-phone">موبايل الطالب</label>
      <div className="flex gap-2">
        <input
          id="student-phone"
          dir="ltr"
          inputMode="numeric"
          className="input text-left"
          placeholder="01xxxxxxxxx"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            if (student) onFound(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (/^01[0125]\d{8}$/.test(phone.trim())) lookupM.mutate();
            }
          }}
        />
        <button
          type="button"
          className="btn-dark shrink-0"
          disabled={!/^01[0125]\d{8}$/.test(phone.trim()) || lookupM.isPending}
          onClick={() => lookupM.mutate()}
        >
          {lookupM.isPending ? <Spinner /> : <Search size={16} />} بحث
        </button>
      </div>
      {student && (
        <div className="mt-2 flex items-center gap-2 rounded-2xl bg-lime-100 px-3 py-2 text-sm text-ink-800">
          <UserCheck size={16} />
          <b>{student.name}</b>
          <span className="text-ink-500">• الرصيد {formatEGP(student.balance)}</span>
        </div>
      )}
    </div>
  );
}

function TopupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [student, setStudent] = useState<StudentLookup | null>(null);
  const [egp, setEgp] = useState('');
  const [note, setNote] = useState('');
  const amount = egpToPiastres(Number(egp) || 0);
  const valid = !!student && amount >= 100 && amount <= 1_000_000 && note.trim().length >= 3;

  const close = () => {
    setStudent(null);
    setEgp('');
    setNote('');
    onClose();
  };

  const topupM = useMutation({
    mutationFn: () => adminFinanceApi.topup({ phone: student!.phone, amount, note: note.trim() }),
    onSuccess: (r) => {
      toast.success(`تم شحن ${formatEGP(amount)} لـ ${student!.name} — الرصيد ${formatEGP(r.balance)}`);
      void qc.invalidateQueries({ queryKey: ['admin', 'payments'] });
      close();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Modal open={open} onClose={topupM.isPending ? () => undefined : close} title="شحن محفظة يدوياً">
      <div className="space-y-4">
        <StudentPicker student={student} onFound={setStudent} />
        <div className="grid grid-cols-[140px_1fr] gap-3">
          <div>
            <label className="label" htmlFor="topup-amount">المبلغ (ج.م)</label>
            <input id="topup-amount" type="number" min={1} max={10000} className="input" value={egp} onChange={(e) => setEgp(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="topup-note">السبب (يُسجَّل)</label>
            <input id="topup-note" className="input" placeholder="مثال: دفع كاش في السنتر" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" className="btn-ghost" onClick={close} disabled={topupM.isPending}>
            إلغاء
          </button>
          <button type="button" className="btn-primary" disabled={!valid || topupM.isPending} onClick={() => topupM.mutate()}>
            {topupM.isPending ? <Spinner /> : <Wallet size={18} />} تأكيد الشحن
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EnrollModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [student, setStudent] = useState<StudentLookup | null>(null);
  const [courseId, setCourseId] = useState<number | ''>('');
  const [note, setNote] = useState('');

  const coursesQ = useQuery({
    queryKey: ['admin', 'courses'],
    queryFn: () => adminCoursesApi.list({ pageSize: 100 }),
    enabled: open,
  });

  const close = () => {
    setStudent(null);
    setCourseId('');
    setNote('');
    onClose();
  };

  const enrollM = useMutation({
    mutationFn: () => adminFinanceApi.enroll({ phone: student!.phone, courseId: Number(courseId), note: note.trim() }),
    onSuccess: (r) => {
      toast.success(`تم تفعيل الاشتراك لـ ${student!.name} حتى ${formatDate(r.expiresAt)}`);
      close();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Modal open={open} onClose={enrollM.isPending ? () => undefined : close} title="اشتراك يدوي">
      <div className="space-y-4">
        <StudentPicker student={student} onFound={setStudent} />
        <div>
          <label className="label" htmlFor="enroll-course">الكورس</label>
          <select
            id="enroll-course"
            className="input"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">اختر الكورس</option>
            {coursesQ.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} — {c.price === 0 ? 'مجاني' : formatEGP(c.price)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-400">لو الطالب مشترك بالفعل تُضاف المدة لاشتراكه الحالي.</p>
        </div>
        <div>
          <label className="label" htmlFor="enroll-note">ملاحظة (اختياري، تُسجَّل)</label>
          <input id="enroll-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" className="btn-ghost" onClick={close} disabled={enrollM.isPending}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!student || !courseId || enrollM.isPending}
            onClick={() => enrollM.mutate()}
          >
            {enrollM.isPending ? <Spinner /> : <UserPlus size={18} />} تفعيل الاشتراك
          </button>
        </div>
      </div>
    </Modal>
  );
}

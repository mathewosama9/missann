import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '../../components/ui/notify';
import { Wallet, CreditCard, Gift, AlertTriangle, CalendarClock } from 'lucide-react';
import { ENROLLMENT_DAYS, formatEGP, type CourseDetailDTO } from '@miss-ann/shared';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { apiErrorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { startOnlinePayment, walletApi } from './api';

// تأكيد الاشتراك: خصم من المحفظة (مع عرض الرصيد قبل/بعد) أو الدفع أونلاين
export function SubscribeModal({
  course,
  open,
  onClose,
}: {
  course: CourseDetailDTO;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const free = course.price === 0;
  const renewing = course.enrolled && course.type === 'MONTHLY';
  const [redirecting, setRedirecting] = useState(false);

  const walletQ = useQuery({ queryKey: ['wallet'], queryFn: walletApi.get, enabled: open && !free });
  const balance = walletQ.data?.balance ?? 0;
  const enough = balance >= course.price;

  const subscribeM = useMutation({
    mutationFn: () => walletApi.subscribe(course.id),
    onSuccess: (r) => {
      toast.success(
        `${renewing ? 'تم تجديد اشتراكك' : 'تم الاشتراك بنجاح'} — ساري حتى ${formatDate(r.expiresAt)}`,
      );
      void qc.invalidateQueries({ queryKey: ['course'] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['me'] }); // لوحة الطالب: الرصيد/الاشتراكات/المطلوب
      void qc.invalidateQueries({ queryKey: ['lesson-access'] });
      onClose();
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'تعذّر إتمام الاشتراك')),
  });

  const payOnline = async () => {
    setRedirecting(true);
    try {
      await startOnlinePayment({ courseId: course.id });
    } catch (e) {
      toast.error(apiErrorMessage(e, 'تعذّر بدء الدفع'));
      setRedirecting(false);
    }
  };

  const busy = subscribeM.isPending || redirecting;
  const days = ENROLLMENT_DAYS[course.type];

  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose} title={renewing ? 'تجديد الاشتراك' : 'الاشتراك في الكورس'}>
      <div className="space-y-5">
        <div className="rounded-3xl border border-ink-900/10 bg-paper-50 p-4">
          <div className="font-semibold text-ink-900">{course.title}</div>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-ink-500">
            <CalendarClock size={15} />
            {renewing && course.enrollmentExpiresAt
              ? `يمتد ${days} يوماً بعد ${formatDate(course.enrollmentExpiresAt)}`
              : `وصول كامل لمدة ${days} يوماً`}
          </div>
        </div>

        {free ? (
          <button type="button" className="btn-primary w-full py-3.5" disabled={busy} onClick={() => subscribeM.mutate()}>
            {subscribeM.isPending ? <Spinner /> : <Gift size={18} />} فعّل الكورس مجاناً
          </button>
        ) : (
          <>
            <dl className="divide-y divide-ink-900/[0.06] rounded-3xl border border-ink-900/10 bg-white text-sm">
              <Row label="سعر الاشتراك" value={formatEGP(course.price)} strong />
              <Row label="رصيد محفظتك" value={walletQ.isPending ? '...' : formatEGP(balance)} />
              {!walletQ.isPending && enough && <Row label="الرصيد بعد الاشتراك" value={formatEGP(balance - course.price)} />}
            </dl>

            {!walletQ.isPending && !enough && (
              <div className="flex items-start gap-2 rounded-2xl bg-coral-100 p-3 text-sm text-ink-800">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-coral-600" />
                <span>
                  رصيدك ينقصه <b>{formatEGP(course.price - balance)}</b>.{' '}
                  <Link to="/dashboard/wallet" className="font-semibold text-ink-900 underline" onClick={onClose}>
                    اشحن المحفظة بكارت
                  </Link>{' '}
                  أو ادفع أونلاين.
                </span>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className="btn-primary whitespace-nowrap px-4 py-3.5"
                disabled={busy || walletQ.isPending || !enough}
                onClick={() => subscribeM.mutate()}
              >
                {subscribeM.isPending ? <Spinner /> : <Wallet size={18} />} ادفع من المحفظة
              </button>
              <button type="button" className="btn-dark whitespace-nowrap px-4 py-3.5" disabled={busy} onClick={payOnline}>
                {redirecting ? <Spinner /> : <CreditCard size={18} />} ادفع أونلاين
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className={strong ? 'font-display text-lg font-extrabold text-ink-900' : 'font-semibold text-ink-800'}>{value}</dd>
    </div>
  );
}

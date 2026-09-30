import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Clock, Wallet, PlayCircle } from 'lucide-react';
import { formatEGP } from '@miss-ann/shared';
import { Spinner } from '../components/ui/Spinner';
import { apiErrorMessage } from '../lib/api';
import { clearPendingPayment, paymentsApi, readPendingPaymentId } from '../features/wallet/api';

const POLL_MS = 2000;
const MAX_WAIT_MS = 60_000; // بعدها نطلب من الطالب المتابعة لاحقاً

// صفحة نتيجة الدفع: لا نثق في معاملات الرابط العائد من Paymob —
// الحالة تُقرأ من الخادم (التي يؤكدها الـ webhook الموقّع فقط)
export function PaymentCallback() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [openedAt] = useState(() => Date.now());
  // merchant_order_id = "<paymentId>-<random>"
  const fromGateway = Number.parseInt(params.get('merchant_order_id') ?? '', 10);
  const paymentId = Number.isInteger(fromGateway) && fromGateway > 0 ? fromGateway : readPendingPaymentId();

  const paymentQ = useQuery({
    queryKey: ['payment', paymentId],
    queryFn: () => paymentsApi.get(paymentId!),
    enabled: paymentId !== null,
    refetchInterval: (q) =>
      q.state.data?.status === 'PENDING' && q.state.dataUpdatedAt - openedAt < MAX_WAIT_MS ? POLL_MS : false,
    retry: 1,
  });
  const payment = paymentQ.data;
  const settled = payment && payment.status !== 'PENDING';

  useEffect(() => {
    if (!settled) return;
    clearPendingPayment();
    if (payment.status === 'PAID') {
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['me'] }); // لوحة الطالب: الرصيد/الاشتراكات/المطلوب
      void qc.invalidateQueries({ queryKey: ['course'] });
    }
  }, [settled, payment?.status, qc]);

  let body: React.ReactNode;
  if (paymentId === null) {
    body = (
      <Result icon={XCircle} tone="coral" title="لا توجد عملية دفع لعرضها" text="ابدأ الدفع من المحفظة أو من صفحة الكورس." />
    );
  } else if (paymentQ.isPending) {
    body = <Pending />;
  } else if (paymentQ.isError) {
    body = <Result icon={XCircle} tone="coral" title="تعذّر قراءة حالة الدفع" text={apiErrorMessage(paymentQ.error)} />;
  } else if (payment!.status === 'PAID') {
    const course = payment!.purpose === 'COURSE';
    body = (
      <Result
        icon={CheckCircle2}
        tone="lime"
        title="تم الدفع بنجاح"
        text={
          course
            ? `تم تفعيل اشتراكك في "${payment!.courseTitle ?? 'الكورس'}".`
            : `تمت إضافة ${formatEGP(payment!.amount)} إلى محفظتك.`
        }
        action={
          course && payment!.courseId ? (
            <Link to={`/course/${payment!.courseId}`} className="btn-primary">
              <PlayCircle size={18} /> اذهب للكورس
            </Link>
          ) : (
            <Link to="/dashboard/wallet" className="btn-primary">
              <Wallet size={18} /> المحفظة
            </Link>
          )
        }
      />
    );
  } else if (payment!.status === 'FAILED') {
    body = (
      <Result
        icon={XCircle}
        tone="coral"
        title="لم تتم عملية الدفع"
        text="لم يُخصم منك شيء. يمكنك المحاولة مرة أخرى أو الشحن بكارت."
        action={
          <Link to={payment!.courseId ? `/course/${payment!.courseId}` : '/dashboard/wallet'} className="btn-dark">
            حاول مرة أخرى
          </Link>
        }
      />
    );
  } else if (paymentQ.dataUpdatedAt - openedAt >= MAX_WAIT_MS) {
    body = (
      <Result
        icon={Clock}
        tone="ink"
        title="الدفع قيد المراجعة"
        text="لم يصلنا تأكيد البوابة بعد. سيُضاف الرصيد تلقائياً فور التأكيد — راجع محفظتك بعد قليل."
        action={
          <Link to="/dashboard/wallet" className="btn-dark">
            <Wallet size={18} /> المحفظة
          </Link>
        }
      />
    );
  } else {
    body = <Pending />;
  }

  return <div className="container-app grid place-items-center py-20">{body}</div>;
}

function Pending() {
  return (
    <div className="card w-full max-w-lg p-10 text-center">
      <Spinner className="mx-auto h-10 w-10 text-brand-500" />
      <h1 className="mt-5 font-display text-2xl font-extrabold text-ink-900">جاري تأكيد الدفع...</h1>
      <p className="mt-2 text-ink-500">لا تغلق الصفحة، ننتظر تأكيد بوابة الدفع.</p>
    </div>
  );
}

const TONES = {
  lime: 'bg-lime-300 text-ink-900',
  coral: 'bg-coral-300 text-ink-900',
  ink: 'bg-ink-900 text-lime-300',
} as const;

function Result({
  icon: Icon,
  tone,
  title,
  text,
  action,
}: {
  icon: typeof CheckCircle2;
  tone: keyof typeof TONES;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card w-full max-w-lg p-10 text-center">
      <span className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${TONES[tone]}`}>
        <Icon size={30} />
      </span>
      <h1 className="mt-5 font-display text-2xl font-extrabold text-ink-900">{title}</h1>
      <p className="mt-2 leading-7 text-ink-500">{text}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

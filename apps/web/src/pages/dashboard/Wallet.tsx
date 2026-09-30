import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '../../components/ui/notify';
import {
  Wallet as WalletIcon,
  Ticket,
  CreditCard,
  ArrowDownLeft,
  ArrowUpRight,
  ReceiptText,
  ShieldCheck,
} from 'lucide-react';
import {
  TOPUP_LIMITS,
  WALLET_TX_LABELS,
  egpToPiastres,
  formatEGP,
  formatRedeemCode,
  normalizeRedeemCode,
  REDEEM_CODE_LENGTH,
  type WalletTxDTO,
} from '@miss-ann/shared';
import { PageTitle } from '../../components/ui/StatCard';
import { Spinner } from '../../components/ui/Spinner';
import { apiErrorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { startOnlinePayment, walletApi } from '../../features/wallet/api';

const QUICK_AMOUNTS = [100, 200, 500];

export function WalletPage() {
  const walletQ = useQuery({ queryKey: ['wallet'], queryFn: walletApi.get });

  return (
    <div className="space-y-6">
      <PageTitle title="المحفظة" subtitle="اشحن رصيدك بكارت شحن أو أونلاين، واشترك في الكورسات بضغطة." />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <BalanceCard balance={walletQ.data?.balance} loading={walletQ.isPending} />
        <RedeemForm />
      </div>

      <OnlineTopup />
      <Transactions items={walletQ.data?.transactions} loading={walletQ.isPending} error={walletQ.isError} />
    </div>
  );
}

function BalanceCard({ balance, loading }: { balance?: number; loading: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-4xl border-2 border-ink-900 bg-ink-900 p-7 text-paper shadow-stamp">
      <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-lime-300/15" aria-hidden />
      <div className="absolute -bottom-12 left-16 h-32 w-32 rounded-full bg-brand-500/25" aria-hidden />
      <div className="relative">
        <span className="inline-flex items-center gap-2 text-sm text-paper/70">
          <WalletIcon size={16} className="text-lime-300" /> رصيدك الحالي
        </span>
        <div className="mt-4 font-display text-5xl font-extrabold text-lime-300">
          {loading ? <Spinner className="h-8 w-8" /> : formatEGP(balance ?? 0)}
        </div>
        <p className="mt-4 flex items-center gap-2 text-sm text-paper/60">
          <ShieldCheck size={15} /> كل عملية مسجّلة وآمنة — الرصيد لا يُخصم إلا عند اشتراكك.
        </p>
      </div>
    </div>
  );
}

function RedeemForm() {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const normalized = normalizeRedeemCode(code);
  const complete = normalized.length === REDEEM_CODE_LENGTH;

  const redeemM = useMutation({
    mutationFn: () => walletApi.redeem(normalized),
    onSuccess: (r) => {
      toast.success(`تم شحن ${formatEGP(r.amount)} — رصيدك الآن ${formatEGP(r.balance)}`);
      setCode('');
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['me'] }); // لوحة الطالب: الرصيد/الاشتراكات/المطلوب
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'تعذّر شحن الكود')),
  });

  return (
    <form
      className="card p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (complete && !redeemM.isPending) redeemM.mutate();
      }}
    >
      <span className="eyebrow">
        <Ticket size={14} /> كارت شحن
      </span>
      <h2 className="mt-3 font-display text-2xl font-extrabold text-ink-900">اشحن بالكود</h2>
      <p className="mt-1 text-sm text-ink-500">اكتب الكود المكتوب على الكارت (16 حرفاً ورقماً).</p>

      <label className="label mt-5" htmlFor="redeem-code">
        كود الشحن
      </label>
      <input
        id="redeem-code"
        dir="ltr"
        autoComplete="off"
        spellCheck={false}
        className="input text-center font-mono text-lg tracking-[0.2em]"
        placeholder="XXXX-XXXX-XXXX-XXXX"
        value={code}
        maxLength={19}
        onChange={(e) => setCode(formatRedeemCode(e.target.value.replace(/[^A-Za-z0-9]/g, '')))}
      />
      <button type="submit" className="btn-primary mt-4 w-full" disabled={!complete || redeemM.isPending}>
        {redeemM.isPending ? <Spinner /> : <Ticket size={18} />} شحن الرصيد
      </button>
    </form>
  );
}

function OnlineTopup() {
  const [egp, setEgp] = useState('');
  const [busy, setBusy] = useState(false);
  const piastres = egpToPiastres(Number(egp) || 0);
  const valid = piastres >= TOPUP_LIMITS.min && piastres <= TOPUP_LIMITS.max;

  const pay = async () => {
    setBusy(true);
    try {
      await startOnlinePayment({ topupAmount: piastres });
    } catch (e) {
      toast.error(apiErrorMessage(e, 'تعذّر بدء الدفع'));
      setBusy(false);
    }
  };

  return (
    <div className="card flex flex-wrap items-end gap-4 p-6">
      <div className="min-w-[220px] flex-1">
        <span className="eyebrow">
          <CreditCard size={14} /> دفع أونلاين
        </span>
        <h2 className="mt-3 font-display text-xl font-extrabold text-ink-900">شحن بالبطاقة أو المحفظة الإلكترونية</h2>
        <p className="mt-1 text-sm text-ink-500">
          من {formatEGP(TOPUP_LIMITS.min)} إلى {formatEGP(TOPUP_LIMITS.max)} — عبر بوابة Paymob الآمنة.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {QUICK_AMOUNTS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setEgp(String(a))}
            className={`tag border transition ${
              Number(egp) === a ? 'border-ink-900 bg-lime-300 text-ink-900' : 'border-ink-900/15 bg-white text-ink-700 hover:border-ink-900/40'
            }`}
          >
            {a} ج.م
          </button>
        ))}
        <input
          type="number"
          inputMode="decimal"
          min={TOPUP_LIMITS.min / 100}
          max={TOPUP_LIMITS.max / 100}
          className="input w-32"
          placeholder="المبلغ"
          aria-label="مبلغ الشحن بالجنيه"
          value={egp}
          onChange={(e) => setEgp(e.target.value)}
        />
        <button type="button" className="btn-dark" disabled={!valid || busy} onClick={pay}>
          {busy ? <Spinner /> : <CreditCard size={18} />} ادفع أونلاين
        </button>
      </div>
    </div>
  );
}

function Transactions({ items, loading, error }: { items?: WalletTxDTO[]; loading: boolean; error: boolean }) {
  return (
    <section>
      <h2 className="mb-3 font-display text-xl font-extrabold text-ink-900">سجل المعاملات</h2>
      {loading ? (
        <div className="grid place-items-center py-12">
          <Spinner className="h-7 w-7 text-brand-500" />
        </div>
      ) : error ? (
        <div className="card p-8 text-center text-coral-600">تعذّر تحميل المعاملات، حدّث الصفحة.</div>
      ) : !items?.length ? (
        <div className="card grid place-items-center gap-3 border-dashed p-12 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-paper-100 text-ink-500">
            <ReceiptText size={24} />
          </span>
          <p className="font-semibold text-ink-900">لا توجد معاملات بعد</p>
          <p className="text-sm text-ink-400">اشحن محفظتك بكارت أو أونلاين وستظهر هنا.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px] text-right">
            <thead className="bg-paper-50">
              <tr className="border-b border-ink-900/[0.06] text-xs text-ink-400">
                <th className="p-4 font-semibold">العملية</th>
                <th className="p-4 font-semibold">المبلغ</th>
                <th className="p-4 font-semibold">الرصيد بعدها</th>
                <th className="p-4 font-semibold">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => {
                const credit = t.amount > 0;
                return (
                  <tr key={t.id} className="border-b border-ink-900/[0.06] last:border-0 hover:bg-paper-50">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <span
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                            credit ? 'bg-lime-200 text-ink-900' : 'bg-coral-100 text-coral-600'
                          }`}
                        >
                          {credit ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-ink-800">{WALLET_TX_LABELS[t.type]}</div>
                          {t.note && <div className="truncate text-xs text-ink-400">{t.note}</div>}
                        </div>
                      </div>
                    </td>
                    <td className={`p-4 font-semibold ${credit ? 'text-ink-900' : 'text-coral-600'}`}>
                      {credit ? '+' : '−'}
                      {formatEGP(Math.abs(t.amount))}
                    </td>
                    <td className="p-4 text-sm text-ink-600">{formatEGP(t.balanceAfter)}</td>
                    <td className="p-4 text-sm text-ink-500">{formatDateTime(t.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

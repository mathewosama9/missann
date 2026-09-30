import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from '../../components/ui/notify';
import { Plus, Ticket, Download, Ban, AlertTriangle, Layers } from 'lucide-react';
import {
  CODE_STATUS_LABELS,
  egpToPiastres,
  formatEGP,
  type CodeBatchCreatedDTO,
  type CodeStatus,
  type AdminCodeDTO,
} from '@miss-ann/shared';
import { PageTitle } from '../../components/ui/StatCard';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pager } from '../../components/ui/Pager';
import { apiErrorMessage } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/format';
import { adminCodesApi } from '../../features/wallet/api';

const STATUS_TAG: Record<CodeStatus, string> = {
  ACTIVE: 'bg-lime-200 text-ink-900',
  USED: 'bg-paper-100 text-ink-500',
  DISABLED: 'bg-coral-100 text-coral-600',
};

export function AdminCodes() {
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState<CodeStatus | ''>('');
  const [batchId, setBatchId] = useState<number | ''>('');
  const [page, setPage] = useState(1);
  const [toDisable, setToDisable] = useState<AdminCodeDTO | null>(null);
  const qc = useQueryClient();

  const batchesQ = useQuery({ queryKey: ['admin', 'code-batches'], queryFn: () => adminCodesApi.batches() });
  const codesQ = useQuery({
    queryKey: ['admin', 'codes', status, batchId, page],
    queryFn: () =>
      adminCodesApi.list({ status: status || undefined, batchId: batchId || undefined, page }),
    placeholderData: keepPreviousData,
  });

  const disableM = useMutation({
    mutationFn: (id: number) => adminCodesApi.disable(id),
    onSuccess: (r) => {
      toast.success(r.message);
      setToDisable(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'codes'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'code-batches'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const batches = batchesQ.data?.items ?? [];
  const codes = codesQ.data;

  return (
    <div className="space-y-6">
      <PageTitle
        title="كروت الشحن"
        subtitle="توليد دفعات أكواد وتتبّع استخدامها. الأكواد تُحفظ مشفّرة ولا تظهر إلا مرة واحدة عند التوليد."
        action={
          <button className="btn-primary" onClick={() => setGenerating(true)}>
            <Plus size={18} /> توليد دفعة
          </button>
        }
      />

      {/* الدفعات */}
      <section>
        <h2 className="mb-3 font-display text-xl font-extrabold text-ink-900">الدفعات</h2>
        {batchesQ.isPending ? (
          <div className="grid place-items-center py-10">
            <Spinner className="h-7 w-7 text-brand-500" />
          </div>
        ) : batches.length === 0 ? (
          <EmptyState icon={Layers} title="لا توجد دفعات بعد" text="ولّد أول دفعة أكواد لبدء بيع كروت الشحن." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {batches.map((b) => {
              const selected = batchId === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setBatchId(selected ? '' : b.id);
                    setPage(1);
                  }}
                  className={`card card-hover p-5 text-right transition ${selected ? 'ring-2 ring-ink-900' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-ink-900">{b.label}</div>
                      <div className="mt-0.5 text-xs text-ink-400">
                        {formatDate(b.createdAt)}
                        {b.createdBy && ` • ${b.createdBy.name}`}
                      </div>
                    </div>
                    <span className="tag shrink-0 bg-ink-900 text-lime-300">{formatEGP(b.value)}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <span className="tag bg-lime-200 text-ink-900">متاح {b.stats.ACTIVE}</span>
                    <span className="tag bg-paper-100 text-ink-600">مستخدم {b.stats.USED}</span>
                    {b.stats.DISABLED > 0 && <span className="tag bg-coral-100 text-coral-600">معطّل {b.stats.DISABLED}</span>}
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(b.stats.USED / Math.max(1, b.count)) * 100}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* الأكواد */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-extrabold text-ink-900">الأكواد</h2>
          <div className="flex flex-wrap gap-2">
            <select
              className="input w-auto py-2"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as CodeStatus | '');
                setPage(1);
              }}
              aria-label="الحالة"
            >
              <option value="">كل الحالات</option>
              {(Object.keys(CODE_STATUS_LABELS) as CodeStatus[]).map((s) => (
                <option key={s} value={s}>
                  {CODE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              className="input w-auto py-2"
              value={batchId}
              onChange={(e) => {
                setBatchId(e.target.value ? Number(e.target.value) : '');
                setPage(1);
              }}
              aria-label="الدفعة"
            >
              <option value="">كل الدفعات</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {codesQ.isPending ? (
          <div className="grid place-items-center py-10">
            <Spinner className="h-7 w-7 text-brand-500" />
          </div>
        ) : codesQ.isError ? (
          <div className="card p-8 text-center text-coral-600">{apiErrorMessage(codesQ.error)}</div>
        ) : !codes?.items.length ? (
          <EmptyState icon={Ticket} title="لا توجد أكواد مطابقة" text="غيّر الفلاتر أو ولّد دفعة جديدة." />
        ) : (
          <>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[760px] text-right">
                <thead className="bg-paper-50">
                  <tr className="border-b border-ink-900/[0.06] text-xs text-ink-400">
                    <th className="p-4 font-semibold">الكود</th>
                    <th className="p-4 font-semibold">القيمة</th>
                    <th className="p-4 font-semibold">الحالة</th>
                    <th className="p-4 font-semibold">الدفعة</th>
                    <th className="p-4 font-semibold">استخدمه</th>
                    <th className="p-4 font-semibold">وقت الاستخدام</th>
                    <th className="p-4 font-semibold">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.items.map((c) => (
                    <tr key={c.id} className="border-b border-ink-900/[0.06] last:border-0 hover:bg-paper-50">
                      <td className="whitespace-nowrap p-4 font-mono text-sm text-ink-700" dir="ltr">
                        ••••-••••-••••-{c.codeHint}
                      </td>
                      <td className="whitespace-nowrap p-4 text-sm font-semibold text-brand-600">{formatEGP(c.value)}</td>
                      <td className="p-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TAG[c.status]}`}>
                          {CODE_STATUS_LABELS[c.status]}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-ink-600">{c.batchLabel}</td>
                      <td className="p-4 text-sm text-ink-700">
                        {c.usedBy ? (
                          <>
                            <div className="font-semibold">{c.usedBy.name}</div>
                            <div className="text-xs text-ink-400" dir="ltr">{c.usedBy.phone}</div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-4 text-sm text-ink-500">{c.usedAt ? formatDateTime(c.usedAt) : '—'}</td>
                      <td className="p-4">
                        {c.status === 'ACTIVE' && (
                          <button
                            type="button"
                            className="grid h-9 w-9 place-items-center rounded-full text-coral-600 hover:bg-coral-100"
                            onClick={() => setToDisable(c)}
                            title="تعطيل"
                            aria-label="تعطيل الكود"
                          >
                            <Ban size={18} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={codes.page} totalPages={codes.totalPages} total={codes.total} onChange={setPage} />
          </>
        )}
      </section>

      <GenerateModal
        open={generating}
        onClose={() => setGenerating(false)}
        onCreated={() => {
          void qc.invalidateQueries({ queryKey: ['admin', 'code-batches'] });
          void qc.invalidateQueries({ queryKey: ['admin', 'codes'] });
        }}
      />

      <Modal open={toDisable !== null} onClose={() => setToDisable(null)} title="تعطيل الكود">
        <p className="leading-7 text-ink-500">
          سيتم تعطيل الكود المنتهي بـ <b dir="ltr">{toDisable?.codeHint}</b> نهائياً ولن يمكن شحنه. هل أنت متأكد؟
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn-ghost" onClick={() => setToDisable(null)} disabled={disableM.isPending}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn bg-coral-500 text-white hover:bg-coral-600"
            onClick={() => toDisable && disableM.mutate(toDisable.id)}
            disabled={disableM.isPending}
          >
            {disableM.isPending ? <Spinner /> : <Ban size={16} />} تعطيل
          </button>
        </div>
      </Modal>
    </div>
  );
}

// ── توليد دفعة + تصدير CSV مرة واحدة ─────────────────────────────
function GenerateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [label, setLabel] = useState('');
  const [valueEgp, setValueEgp] = useState('');
  const [count, setCount] = useState('');
  const [result, setResult] = useState<CodeBatchCreatedDTO | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const value = egpToPiastres(Number(valueEgp) || 0);
  const n = Number(count) || 0;
  const valid = label.trim().length >= 2 && value >= 100 && value <= 1_000_000 && Number.isInteger(n) && n >= 1 && n <= 5000;

  const createM = useMutation({
    mutationFn: () => adminCodesApi.createBatch({ label: label.trim(), value, count: n }),
    onSuccess: (r) => {
      setResult(r);
      downloadCsv(r);
      setDownloaded(true);
      onCreated();
      toast.success(`تم توليد ${r.codes.length} كود`);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const reset = () => {
    createM.reset(); // لا تبقى الأكواد الخام في كاش الطلبات
    setLabel('');
    setValueEgp('');
    setCount('');
    setResult(null);
    setDownloaded(false);
  };

  const close = () => {
    if (createM.isPending) return;
    if (result && !downloaded && !window.confirm('لم تحمّل ملف الأكواد، ولن تتمكن من رؤيتها مرة أخرى. إغلاق؟')) return;
    reset();
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={result ? 'الأكواد جاهزة' : 'توليد دفعة أكواد'}>
      {result ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-2xl bg-coral-100 p-3 text-sm text-ink-800">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-coral-600" />
            <span>
              هذه هي <b>المرة الوحيدة</b> التي تظهر فيها الأكواد. احفظ ملف CSV في مكان آمن قبل الإغلاق.
            </span>
          </div>
          <div className="rounded-2xl border border-ink-900/10 bg-paper-50 p-4 text-sm">
            <div className="font-semibold text-ink-900">{result.batch.label}</div>
            <div className="mt-1 text-ink-500">
              {result.codes.length} كود × {formatEGP(result.batch.value)}
            </div>
            <ul className="mt-3 space-y-1 font-mono text-xs text-ink-600" dir="ltr">
              {result.codes.slice(0, 5).map((c) => (
                <li key={c}>{c}</li>
              ))}
              {result.codes.length > 5 && <li className="text-ink-400">… +{result.codes.length - 5}</li>}
            </ul>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                downloadCsv(result);
                setDownloaded(true);
              }}
            >
              <Download size={16} /> تحميل CSV مرة أخرى
            </button>
            <button type="button" className="btn-primary" onClick={close}>
              تم
            </button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) createM.mutate();
          }}
        >
          <div>
            <label className="label" htmlFor="batch-label">اسم الدفعة</label>
            <input id="batch-label" className="input" placeholder="مثال: مكتبة النور — أكتوبر" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="batch-value">قيمة الكارت (ج.م)</label>
              <input id="batch-value" type="number" min={1} max={10000} className="input" value={valueEgp} onChange={(e) => setValueEgp(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="batch-count">عدد الأكواد</label>
              <input id="batch-count" type="number" min={1} max={5000} className="input" value={count} onChange={(e) => setCount(e.target.value)} />
            </div>
          </div>
          {valid && (
            <p className="text-sm text-ink-500">
              إجمالي القيمة: <b className="text-ink-900">{formatEGP(value * n)}</b>
            </p>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" className="btn-ghost" onClick={close}>
              إلغاء
            </button>
            <button type="submit" className="btn-primary" disabled={!valid || createM.isPending}>
              {createM.isPending ? <Spinner /> : <Ticket size={18} />} توليد وتحميل CSV
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function downloadCsv(r: CodeBatchCreatedDTO) {
  // اقتباس + منع حقن الصيغ في Excel (خلية تبدأ بـ = + - @ أو Tab/CR — توصية OWASP)
  const safe = (s: string) => `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  const rows = [
    ['code', 'value_egp', 'batch'].join(','),
    ...r.codes.map((c) => [c, r.batch.value / 100, safe(r.batch.label)].join(',')),
  ];
  // BOM حتى يفتح Excel العربية بشكل صحيح
  const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `codes-batch-${r.batch.id}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

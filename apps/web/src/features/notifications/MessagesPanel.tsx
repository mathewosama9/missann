import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquareOff } from 'lucide-react';
import {
  NOTIF_CHANNEL_LABELS,
  NOTIF_STATUS_LABELS,
  NOTIF_TYPE_LABELS,
  NotifStatus,
  type AdminMessageDTO,
  type NotifChannel,
} from '@miss-ann/shared';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pager } from '../../components/ui/Pager';
import { Spinner } from '../../components/ui/Spinner';
import { formatDateTime } from '../../lib/format';
import { adminNotificationsApi } from './api';

const CHANNEL_TAG: Record<NotifChannel, string> = {
  WHATSAPP: 'bg-lime-200 text-ink-900',
  SMS: 'bg-brand-50 text-brand-700',
  IN_APP: 'bg-paper-100 text-ink-600',
};
const STATUS_TABS: NotifStatus[] = ['FAILED', 'PENDING', 'SENT'];

// سجل رسائل واتساب/SMS الصادرة حسب الحالة (الفاشلة أولاً للمتابعة)
export function MessagesPanel() {
  const [status, setStatus] = useState<NotifStatus>('FAILED');
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['admin', 'notif-messages', status, page],
    queryFn: () => adminNotificationsApi.messages(status, page),
    placeholderData: (prev) => prev,
  });

  return (
    <div>
      <div className="inline-flex rounded-full border border-ink-900/10 bg-white p-1" role="tablist">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${status === s ? 'bg-ink-900 text-paper' : 'text-ink-600 hover:text-ink-900'}`}
          >
            {NOTIF_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {q.isPending ? (
        <div className="grid place-items-center py-16">
          <Spinner className="h-8 w-8 text-brand-500" />
        </div>
      ) : !q.data || q.data.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={MessageSquareOff} title="لا توجد رسائل هنا" text="رسائل واتساب/SMS (كود التحقق، نتائج أولياء الأمور، التذكيرات) تظهر حسب حالتها." />
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-3">
            {q.data.items.map((m) => (
              <MessageCard key={m.id} m={m} />
            ))}
          </div>
          <Pager page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}

function MessageCard({ m }: { m: AdminMessageDTO }) {
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="tag bg-paper-100 text-ink-700">{NOTIF_TYPE_LABELS[m.type]}</span>
        <span className={`tag ${CHANNEL_TAG[m.channel]}`}>{NOTIF_CHANNEL_LABELS[m.channel]}</span>
        {m.status === 'FAILED' && <span className="tag bg-coral-100 text-coral-700">{NOTIF_STATUS_LABELS.FAILED}</span>}
        <span className="text-ink-400">
          {m.userName} · <span dir="ltr">{m.toPhone}</span>
        </span>
      </div>
      <p className="mt-2 whitespace-pre-line break-words text-sm text-ink-700">{m.body}</p>
      {m.lastError && <p className="mt-2 break-words rounded-xl bg-coral-100/60 px-3 py-2 text-xs text-coral-700">{m.lastError}</p>}
      <div className="mt-2 text-xs text-ink-400">
        {formatDateTime(m.createdAt)} · محاولات: {m.attempts}
        {m.sentAt && ` · أُرسلت ${formatDateTime(m.sentAt)}`}
      </div>
    </div>
  );
}

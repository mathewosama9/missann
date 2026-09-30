import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BellOff, CheckCheck } from 'lucide-react';
import type { NotificationDTO } from '@miss-ann/shared';
import { PageTitle } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pager } from '../../components/ui/Pager';
import { Spinner } from '../../components/ui/Spinner';
import { inboxKeys, notificationsApi } from '../../features/notifications/api';
import { NotificationItem } from '../../features/notifications/NotificationItem';
import { useMarkAllRead, useMarkRead } from '../../features/notifications/useInbox';

type Filter = 'all' | 'unread';
const PAGE_SIZE = 20;

export function NotificationsPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const listQ = useQuery({
    queryKey: inboxKeys.list(filter, page, PAGE_SIZE),
    queryFn: () => notificationsApi.list({ filter, page, pageSize: PAGE_SIZE }),
    placeholderData: (prev) => prev,
  });
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const open = (n: NotificationDTO) => !n.isRead && markRead.mutate(n.id);

  const data = listQ.data;
  return (
    <div>
      <PageTitle
        title="الإشعارات"
        subtitle="تذكير الحصص اللايف، انتهاء الاشتراك، وإعلانات مس آن."
        action={
          <button type="button" className="btn-ghost" onClick={() => markAll.mutate(undefined)} disabled={!data?.unread || markAll.isPending}>
            <CheckCheck size={18} /> تحديد الكل كمقروء
          </button>
        }
      />

      <div className="mt-6 inline-flex rounded-full border border-ink-900/10 bg-white p-1" role="tablist">
        {(
          [
            ['all', 'الكل'],
            ['unread', `غير المقروءة${data?.unread ? ` (${data.unread})` : ''}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => {
              setFilter(key);
              setPage(1);
            }}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${filter === key ? 'bg-ink-900 text-paper' : 'text-ink-600 hover:text-ink-900'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {listQ.isPending ? (
        <div className="grid place-items-center py-20">
          <Spinner className="h-8 w-8 text-brand-500" />
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={BellOff}
            title={filter === 'unread' ? 'لا توجد إشعارات غير مقروءة' : 'لا توجد إشعارات بعد'}
            text="تصلك هنا تذكيرات الحصص وإعلانات مس آن أولاً بأول."
          />
        </div>
      ) : (
        <>
          <div className="card mt-6 space-y-1 p-2">
            {data.items.map((n) => (
              <NotificationItem key={n.id} n={n} onOpen={open} />
            ))}
          </div>
          <Pager page={data.page} totalPages={data.totalPages} total={data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}

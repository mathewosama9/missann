import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { NOTIF_BELL_SIZE, type NotificationDTO } from '@miss-ann/shared';
import { Spinner } from '../../components/ui/Spinner';
import { inboxKeys, notificationsApi } from './api';
import { NotificationItem } from './NotificationItem';
import { useMarkAllRead, useMarkRead, useUnreadCount } from './useInbox';

// جرس الهيدر: عدّاد غير المقروء + قائمة منسدلة بآخر الإشعارات (تُجلب عند الفتح فقط).
// على الموبايل القائمة بعرض الشاشة (fixed) حتى لا تخرج عن الحواف.
export function NotificationBell({ allHref }: { allHref?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const unread = useUnreadCount().data ?? 0;
  const listQ = useQuery({
    queryKey: inboxKeys.list('all', 1, NOTIF_BELL_SIZE),
    queryFn: () => notificationsApi.list({ filter: 'all', page: 1, pageSize: NOTIF_BELL_SIZE }),
    enabled: open,
    staleTime: 0,
  });
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  // إغلاق بالنقر خارج القائمة أو Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openItem = (n: NotificationDTO) => {
    if (!n.isRead) markRead.mutate(n.id);
  };

  const items = listQ.data?.items ?? [];
  const badge = unread > 99 ? '99+' : String(unread);
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="btn-icon relative"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `الإشعارات — ${unread} غير مقروء` : 'الإشعارات'}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -left-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-coral-500 px-1 text-[10px] font-semibold text-white ring-2 ring-paper" data-testid="unread-badge">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="الإشعارات"
          className="card animate-pop fixed inset-x-4 top-20 z-40 flex max-h-[70vh] flex-col overflow-hidden p-0 sm:absolute sm:inset-x-auto sm:left-0 sm:top-12 sm:w-96"
        >
          <div className="flex items-center justify-between gap-2 border-b border-ink-900/[0.06] px-4 py-3">
            <span className="font-display text-lg font-extrabold text-ink-900">الإشعارات</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-40"
              onClick={() => markAll.mutate(undefined)}
              disabled={unread === 0 || markAll.isPending}
            >
              <CheckCheck size={15} /> تحديد الكل كمقروء
            </button>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {listQ.isPending ? (
              <div className="grid place-items-center py-10">
                <Spinner className="h-6 w-6 text-brand-500" />
              </div>
            ) : items.length === 0 ? (
              <div className="grid place-items-center gap-2 py-10 text-center text-sm text-ink-400">
                <BellOff size={22} />
                لا توجد إشعارات بعد
              </div>
            ) : (
              items.map((n) => <NotificationItem key={n.id} n={n} onOpen={openItem} compact />)
            )}
          </div>
          {allHref && (
            <Link
              to={allHref}
              onClick={() => setOpen(false)}
              className="border-t border-ink-900/[0.06] px-4 py-3 text-center text-sm font-semibold text-brand-600 hover:bg-paper-50"
            >
              عرض كل الإشعارات
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

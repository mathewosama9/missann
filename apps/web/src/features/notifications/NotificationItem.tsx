import { Bell, CalendarClock, ClipboardList, KeyRound, Megaphone, Video, type LucideIcon } from 'lucide-react';
import type { NotificationDTO, NotifType } from '@miss-ann/shared';
import { formatRelative } from '../../lib/format';

const ICONS: Record<NotifType, LucideIcon> = {
  GENERAL: Megaphone,
  LIVE_REMINDER: Video,
  ENROLLMENT_EXPIRY: CalendarClock,
  PARENT_EXAM_RESULT: ClipboardList,
  OTP: KeyRound,
};

// عنصر إشعار (الجرس والصفحة): غير المقروء أبيض بنقطة lime وخط أثقل، والمقروء باهت.
// النص يُعرض كنص React (مُهرَّب تلقائياً) — لا HTML من الخادم إطلاقاً.
export function NotificationItem({ n, onOpen, compact }: { n: NotificationDTO; onOpen: (n: NotificationDTO) => void; compact?: boolean }) {
  const Icon = ICONS[n.type] ?? Bell;
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={`flex w-full items-start gap-3 rounded-2xl p-3 text-right transition hover:bg-paper-100 ${
        n.isRead ? 'bg-paper-50 text-ink-500' : 'bg-white text-ink-900'
      }`}
    >
      <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${n.isRead ? 'bg-paper-100 text-ink-400' : 'bg-lime-200 text-ink-900'}`}>
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className={`break-words text-sm ${n.isRead ? 'font-medium' : 'font-semibold'}`}>{n.title}</span>
          {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-lime-400 ring-2 ring-lime-100" aria-label="غير مقروء" />}
        </span>
        <span className={`mt-1 block whitespace-pre-line break-words text-sm leading-relaxed ${compact ? 'line-clamp-2' : ''} ${n.isRead ? 'text-ink-400' : 'text-ink-600'}`}>
          {n.body}
        </span>
        <span className="mt-1.5 block text-xs text-ink-400">{formatRelative(n.createdAt)}</span>
      </span>
    </button>
  );
}

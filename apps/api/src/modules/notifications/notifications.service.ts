import type { NotificationDTO, NotificationListDTO, NotificationListFilter } from '@miss-ann/shared';
import { prisma } from '../../lib/prisma.js';
import { notFound, paginate } from '../../lib/http.js';

// ── صندوق إشعارات المستخدم (IN_APP فقط، ملكه فقط) ─────────────────
// كل الاستعلامات تبدأ بـ (userId, channel) ← الفهرسان (userId, channel, id) و (userId, channel, isRead, id)

const inbox = (userId: number) => ({ userId, channel: 'IN_APP' as const });
const select = { id: true, title: true, body: true, type: true, isRead: true, createdAt: true } as const;

// العدّاد: index-only على (userId, channel, isRead) — رخيص للاستطلاع الدوري
export function unreadCount(userId: number): Promise<number> {
  return prisma.notification.count({ where: { ...inbox(userId), isRead: false } });
}

export async function listNotifications(userId: number, f: NotificationListFilter): Promise<NotificationListDTO> {
  const where = { ...inbox(userId), ...(f.filter === 'unread' && { isRead: false }) };
  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, select, orderBy: { id: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    prisma.notification.count({ where }),
    unreadCount(userId),
  ]);
  const items: NotificationDTO[] = rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  return { ...paginate(items, total, f.page, f.pageSize), unread };
}

// إشعار غيره (أو رسالة صادرة) ← 404 بنفس رد غير الموجود (لا تسريب لوجوده)
export async function markRead(userId: number, id: number): Promise<{ unread: number }> {
  const { count } = await prisma.notification.updateMany({ where: { id, ...inbox(userId) }, data: { isRead: true } });
  if (count === 0) throw notFound('الإشعار غير موجود');
  return { unread: await unreadCount(userId) };
}

export async function markAllRead(userId: number): Promise<{ updated: number }> {
  const { count } = await prisma.notification.updateMany({ where: { ...inbox(userId), isRead: false }, data: { isRead: true } });
  return { updated: count };
}

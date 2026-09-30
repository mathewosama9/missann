import { api } from '../../lib/api';
import type {
  AdminBroadcastDTO,
  AdminMessageDTO,
  BroadcastInput,
  NotificationListDTO,
  NotificationTemplateDTO,
  NotifStatus,
  Paginated,
  TemplateChannel,
} from '@miss-ann/shared';

// مفاتيح الكاش: كل ما يخص صندوق المستخدم تحت ['notifications'] ← إبطال واحد بعد أي قراءة
export const inboxKeys = {
  all: ['notifications'] as const,
  unread: ['notifications', 'unread'] as const,
  list: (filter: 'all' | 'unread', page: number, pageSize: number) => ['notifications', 'list', { filter, page, pageSize }] as const,
};

// ── صندوق المستخدم ───────────────────────────────────────────────
export const notificationsApi = {
  list: (params: { filter: 'all' | 'unread'; page: number; pageSize: number }) =>
    api.get<NotificationListDTO>('/notifications', { params }).then((r) => r.data),

  unreadCount: () => api.get<{ count: number }>('/notifications/unread-count').then((r) => r.data.count),

  read: (id: number) => api.patch<{ unread: number }>(`/notifications/${id}/read`).then((r) => r.data),

  readAll: () => api.patch<{ updated: number }>('/notifications/read-all').then((r) => r.data),
};

// ── أدمن ─────────────────────────────────────────────────────────
export type TemplateContent = { title: string; body: string };

export const adminNotificationsApi = {
  broadcast: (data: BroadcastInput) =>
    api.post<{ broadcast: AdminBroadcastDTO }>('/admin/notifications/broadcast', data).then((r) => r.data.broadcast),

  broadcasts: (page: number) =>
    api.get<Paginated<AdminBroadcastDTO>>('/admin/notifications/broadcasts', { params: { page } }).then((r) => r.data),

  messages: (status: NotifStatus, page: number) =>
    api.get<Paginated<AdminMessageDTO>>('/admin/notifications/messages', { params: { status, page } }).then((r) => r.data),

  templates: () =>
    api.get<{ items: NotificationTemplateDTO[] }>('/admin/notifications/templates').then((r) => r.data.items),

  createTemplate: (data: TemplateContent & { key: string; channel: TemplateChannel }) =>
    api.post<{ template: NotificationTemplateDTO }>('/admin/notifications/templates', data).then((r) => r.data.template),

  saveTemplate: (key: string, channel: TemplateChannel, data: TemplateContent) =>
    api.put<{ template: NotificationTemplateDTO }>(`/admin/notifications/templates/${key}/${channel}`, data).then((r) => r.data.template),

  deleteTemplate: (key: string, channel: TemplateChannel) =>
    api.delete<{ message: string }>(`/admin/notifications/templates/${key}/${channel}`).then((r) => r.data),
};

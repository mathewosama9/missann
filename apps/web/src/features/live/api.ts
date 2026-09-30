import { api } from '../../lib/api';
import type { AdminLiveSessionDTO, LiveCreateInput, LiveListDTO, Paginated } from '@miss-ann/shared';

export type LivePayload = Omit<LiveCreateInput, 'startAt'> & { startAt: string };

// ── طالب ─────────────────────────────────────────────────────────
export const liveApi = {
  list: (page: number) => api.get<LiveListDTO>('/live', { params: { page } }).then((r) => r.data),
};

// ── أدمن ─────────────────────────────────────────────────────────
export const adminLiveApi = {
  list: (params: { scope: 'upcoming' | 'past'; courseId?: number; page?: number }) =>
    api.get<Paginated<AdminLiveSessionDTO>>('/admin/live', { params: { ...params, pageSize: 20 } }).then((r) => r.data),

  create: (data: LivePayload) =>
    api.post<{ session: AdminLiveSessionDTO }>('/admin/live', data).then((r) => r.data.session),

  update: (id: number, data: Partial<Omit<LivePayload, 'courseId'>>) =>
    api.patch<{ session: AdminLiveSessionDTO }>(`/admin/live/${id}`, data).then((r) => r.data.session),

  remove: (id: number) => api.delete<{ message: string }>(`/admin/live/${id}`).then((r) => r.data),
};

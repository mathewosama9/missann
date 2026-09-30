import { api } from '../../lib/api';
import type {
  AdminStatsDTO,
  AdminStudentDetailDTO,
  AdminStudentListItemDTO,
  AuditLogDTO,
  Grade,
  Paginated,
  PlatformSettingsDTO,
  StaffDTO,
  TempPasswordDTO,
} from '@miss-ann/shared';

// ── لوحة الأدمن (Phase 8) ─────────────────────────────────────────
export interface StudentsQuery {
  q?: string;
  grade?: Grade;
  status?: 'active' | 'inactive';
  page: number;
}

export interface AuditQuery {
  action?: string;
  entity?: string;
  from?: string;
  to?: string;
  page: number;
}

export const adminKeys = {
  stats: ['admin', 'stats'] as const,
  students: (q: StudentsQuery) => ['admin', 'students', q] as const,
  student: (id: number) => ['admin', 'students', 'detail', id] as const,
  staff: ['admin', 'staff'] as const,
  settings: ['admin', 'settings'] as const,
  audit: (q: AuditQuery) => ['admin', 'audit', q] as const,
};

export const adminApi = {
  stats: () => api.get<AdminStatsDTO>('/admin/stats').then((r) => r.data),

  students: (params: StudentsQuery) =>
    api.get<Paginated<AdminStudentListItemDTO>>('/admin/students', { params }).then((r) => r.data),
  student: (id: number) => api.get<{ student: AdminStudentDetailDTO }>(`/admin/students/${id}`).then((r) => r.data.student),
  setStudentActive: (id: number, isActive: boolean) => api.patch(`/admin/students/${id}/status`, { isActive }).then((r) => r.data),
  resetStudentPassword: (id: number) => api.post<TempPasswordDTO>(`/admin/students/${id}/reset-password`).then((r) => r.data),
  removeStudentDevice: (id: number, deviceId: number) =>
    api.delete<{ message: string }>(`/admin/students/${id}/devices/${deviceId}`).then((r) => r.data),

  staff: () => api.get<{ items: StaffDTO[] }>('/admin/staff').then((r) => r.data.items),
  createAssistant: (data: { name: string; phone: string; email?: string }) =>
    api.post<{ staff: StaffDTO; tempPassword: string }>('/admin/staff', data).then((r) => r.data),
  setStaffActive: (id: number, isActive: boolean) => api.patch(`/admin/staff/${id}/status`, { isActive }).then((r) => r.data),
  resetStaffPassword: (id: number) => api.post<TempPasswordDTO>(`/admin/staff/${id}/reset-password`).then((r) => r.data),

  settings: () => api.get<{ settings: PlatformSettingsDTO }>('/admin/settings').then((r) => r.data.settings),
  saveSettings: (data: { requirePhoneVerification: boolean }) =>
    api.put<{ settings: PlatformSettingsDTO }>('/admin/settings', data).then((r) => r.data.settings),

  audit: (params: AuditQuery) => api.get<Paginated<AuditLogDTO>>('/admin/audit-logs', { params }).then((r) => r.data),
};

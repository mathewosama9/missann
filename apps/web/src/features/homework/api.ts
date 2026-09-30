import axios from 'axios';
import { api } from '../../lib/api';
import type {
  AdminHomeworkDTO,
  AdminSubmissionDTO,
  HomeworkCreateInput,
  HomeworkListDTO,
  HomeworkSubmissionDTO,
  HomeworkTab,
  Paginated,
} from '@miss-ann/shared';

// التاريخ يُرسل كنص ISO (الخادم يحوّله بـ z.coerce.date)
export type HomeworkPayload = Omit<HomeworkCreateInput, 'dueAt'> & { dueAt?: string | null };

// ملف خاص يُجلب بتوكن الوصول (لا رابط مباشر — الملفات لا تُقدَّم علناً).
// رد الخطأ يصل Blob أيضاً ← يُحوَّل JSON ليظهر نص الخادم (404/429) عبر apiErrorMessage
export const fetchPrivateFile = (url: string) =>
  api
    .get<Blob>(url, { responseType: 'blob' })
    .then((r) => r.data)
    .catch(async (err: unknown) => {
      if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
        err.response.data = await err.response.data
          .text()
          .then((t) => JSON.parse(t) as unknown)
          .catch(() => undefined);
      }
      throw err;
    });

export const submissionFileUrl = (submissionId: number) => `/homework/submissions/${submissionId}/file`;
export const attachmentFileUrl = (homeworkId: number) => `/homework/${homeworkId}/attachment`;

// ── طالب ─────────────────────────────────────────────────────────
export const homeworkApi = {
  list: (params: { tab: HomeworkTab; page: number }) =>
    api.get<HomeworkListDTO>('/homework', { params }).then((r) => r.data),

  submit: (id: number, file: File, onProgress?: (percent: number) => void) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<{ submission: HomeworkSubmissionDTO }>(`/homework/${id}/submit`, form, {
        onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
      })
      .then((r) => r.data.submission);
  },
};

// ── أدمن ─────────────────────────────────────────────────────────
export const adminHomeworkApi = {
  list: (params: { courseId?: number; q?: string; page?: number }) =>
    api.get<Paginated<AdminHomeworkDTO>>('/admin/homework', { params: { ...params, pageSize: 20 } }).then((r) => r.data),

  detail: (id: number) => api.get<{ homework: AdminHomeworkDTO }>(`/admin/homework/${id}`).then((r) => r.data.homework),

  create: (data: HomeworkPayload) =>
    api.post<{ homework: AdminHomeworkDTO }>('/admin/homework', data).then((r) => r.data.homework),

  update: (id: number, data: Partial<Omit<HomeworkPayload, 'courseId'>>) =>
    api.patch<{ homework: AdminHomeworkDTO }>(`/admin/homework/${id}`, data).then((r) => r.data.homework),

  remove: (id: number) => api.delete<{ message: string }>(`/admin/homework/${id}`).then((r) => r.data),

  setAttachment: (id: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ homework: AdminHomeworkDTO }>(`/admin/homework/${id}/attachment`, form).then((r) => r.data.homework);
  },

  removeAttachment: (id: number) =>
    api.delete<{ homework: AdminHomeworkDTO }>(`/admin/homework/${id}/attachment`).then((r) => r.data.homework),

  submissions: (id: number, params: { status?: 'PENDING' | 'GRADED'; page?: number }) =>
    api.get<Paginated<AdminSubmissionDTO>>(`/admin/homework/${id}/submissions`, { params }).then((r) => r.data),

  // submittedAt: نسخة الحل المعروضة — الخادم يرفض (409) لو استبدلها الطالب بعد فتحها
  grade: (id: number, submissionId: number, data: { grade: number; feedback: string; submittedAt: string }) =>
    api
      .patch<{ submission: AdminSubmissionDTO }>(`/admin/homework/${id}/submissions/${submissionId}/grade`, data)
      .then((r) => r.data.submission),
};

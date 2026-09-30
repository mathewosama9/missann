import { api } from '../../lib/api';
import type {
  AdminAttemptDetailDTO,
  AdminAttemptRowDTO,
  AdminExamDetailDTO,
  AdminExamListItemDTO,
  AnswerSavedDTO,
  AttemptResultDTO,
  AttemptSessionDTO,
  AttemptStatus,
  ExamAnalyticsDTO,
  ExamCreateInput,
  ExamListItemDTO,
  Grade,
  GradeAttemptInput,
  Paginated,
  QuestionInput,
} from '@miss-ann/shared';

// التواريخ تُرسل كنص ISO (الخادم يحوّلها بـ z.coerce.date)
export type ExamPayload = Omit<ExamCreateInput, 'startAt' | 'endAt'> & { startAt?: string | null; endAt?: string | null };

// ── طالب ─────────────────────────────────────────────────────────
export const examsApi = {
  list: () => api.get<{ items: ExamListItemDTO[] }>('/exams').then((r) => r.data.items),

  detail: (id: number) => api.get<{ exam: ExamListItemDTO }>(`/exams/${id}`).then((r) => r.data.exam),

  // يبدأ المحاولة أو يستأنفها (نفس الموعد والترتيب والإجابات المحفوظة)
  start: (id: number) => api.post<AttemptSessionDTO>(`/exams/${id}/start`).then((r) => r.data),

  // اختيار (موضوعي) أو نص (كتابي)
  answer: (attemptId: number, questionId: number, value: { choiceId: number } | { text: string }) =>
    api.patch<AnswerSavedDTO>(`/attempts/${attemptId}/answer`, { questionId, ...value }).then((r) => r.data),

  submit: (attemptId: number) => api.post<AttemptResultDTO>(`/attempts/${attemptId}/submit`).then((r) => r.data),

  result: (attemptId: number) => api.get<AttemptResultDTO>(`/attempts/${attemptId}/result`).then((r) => r.data),
};

// ── أدمن ─────────────────────────────────────────────────────────
export const adminExamsApi = {
  list: (params: { grade?: Grade; courseId?: number; q?: string; page?: number }) =>
    api.get<Paginated<AdminExamListItemDTO>>('/admin/exams', { params: { ...params, pageSize: 20 } }).then((r) => r.data),

  detail: (id: number) => api.get<{ exam: AdminExamDetailDTO }>(`/admin/exams/${id}`).then((r) => r.data.exam),

  create: (data: ExamPayload) =>
    api.post<{ exam: AdminExamDetailDTO }>('/admin/exams', data).then((r) => r.data.exam),

  update: (id: number, data: Partial<ExamPayload>) =>
    api.patch<{ exam: AdminExamDetailDTO }>(`/admin/exams/${id}`, data).then((r) => r.data.exam),

  remove: (id: number) => api.delete<{ message: string }>(`/admin/exams/${id}`).then((r) => r.data),

  addQuestion: (examId: number, data: QuestionInput) =>
    api.post<{ exam: AdminExamDetailDTO }>(`/admin/exams/${examId}/questions`, data).then((r) => r.data.exam),

  updateQuestion: (id: number, data: QuestionInput) =>
    api.patch<{ exam: AdminExamDetailDTO }>(`/admin/questions/${id}`, data).then((r) => r.data.exam),

  removeQuestion: (id: number) =>
    api.delete<{ exam: AdminExamDetailDTO }>(`/admin/questions/${id}`).then((r) => r.data.exam),

  reorder: (examId: number, items: { id: number; order: number }[]) =>
    api.patch<{ exam: AdminExamDetailDTO }>(`/admin/exams/${examId}/questions/reorder`, { items }).then((r) => r.data.exam),

  analytics: (id: number) => api.get<ExamAnalyticsDTO>(`/admin/exams/${id}/analytics`).then((r) => r.data),

  // إعلان النتائج يدوياً (وضع «عندما أعلنها بنفسي») أو سحبها
  release: (id: number, released: boolean) =>
    api.post<{ exam: AdminExamDetailDTO }>(`/admin/exams/${id}/release`, { released }).then((r) => r.data.exam),

  attemptDetail: (attemptId: number) =>
    api.get<{ attempt: AdminAttemptDetailDTO }>(`/admin/attempts/${attemptId}`).then((r) => r.data.attempt),

  grade: (attemptId: number, grades: GradeAttemptInput['grades']) =>
    api.patch<{ attempt: AdminAttemptDetailDTO }>(`/admin/attempts/${attemptId}/grade`, { grades }).then((r) => r.data.attempt),

  attempts: (id: number, params: { status?: AttemptStatus; grading?: 'PENDING' | 'GRADED'; page?: number }) =>
    api.get<Paginated<AdminAttemptRowDTO>>(`/admin/exams/${id}/attempts`, { params }).then((r) => r.data),

  uploadImage: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ url: string }>('/admin/uploads/image', form).then((r) => r.data.url);
  },
};

import { api } from '../../lib/api';
import type {
  Paginated,
  CourseListItem,
  CourseDetailDTO,
  CourseCreateInput,
  AdminCourseDTO,
  AdminLessonDTO,
  LessonCreateInput,
  AttachmentDTO,
} from '@miss-ann/shared';

export interface CourseQuery {
  grade?: string;
  type?: string;
  term?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminCourseListItem extends CourseListItem {
  isPublished: boolean;
}

// ── عام / طالب ───────────────────────────────────────────────────
export const coursesApi = {
  list: (params: CourseQuery) =>
    api.get<Paginated<CourseListItem>>('/courses', { params }).then((r) => r.data),

  detail: (id: number | string) =>
    api.get<{ course: CourseDetailDTO }>(`/courses/${id}`).then((r) => r.data.course),
};

// ── أدمن ─────────────────────────────────────────────────────────
export const adminCoursesApi = {
  list: (params: CourseQuery & { isPublished?: boolean }) =>
    api.get<Paginated<AdminCourseListItem>>('/admin/courses', { params }).then((r) => r.data),

  detail: (id: number) =>
    api.get<{ course: AdminCourseDTO }>(`/admin/courses/${id}`).then((r) => r.data.course),

  create: (data: CourseCreateInput) =>
    api.post<{ course: CourseListItem }>('/admin/courses', data).then((r) => r.data.course),

  update: (id: number, data: Partial<CourseCreateInput>) =>
    api.patch<{ course: CourseListItem }>(`/admin/courses/${id}`, data).then((r) => r.data.course),

  publish: (id: number, isPublished: boolean) =>
    api.patch<{ message: string }>(`/admin/courses/${id}/publish`, { isPublished }).then((r) => r.data),

  remove: (id: number) =>
    api.delete<{ message: string }>(`/admin/courses/${id}`).then((r) => r.data),

  addLesson: (courseId: number, data: LessonCreateInput) =>
    api.post<{ lesson: AdminLessonDTO }>(`/admin/courses/${courseId}/lessons`, data).then((r) => r.data.lesson),

  updateLesson: (lessonId: number, data: Partial<LessonCreateInput>) =>
    api.patch<{ message: string }>(`/admin/lessons/${lessonId}`, data).then((r) => r.data),

  removeLesson: (lessonId: number) =>
    api.delete<{ message: string }>(`/admin/lessons/${lessonId}`).then((r) => r.data),

  reorderLessons: (courseId: number, items: { id: number; order: number }[]) =>
    api.patch<{ message: string }>(`/admin/courses/${courseId}/lessons/reorder`, { items }).then((r) => r.data),

  addAttachment: (lessonId: number, data: { type: string; url: string; title: string }) =>
    api.post<{ attachment: AttachmentDTO }>(`/admin/lessons/${lessonId}/attachments`, data).then((r) => r.data.attachment),

  removeAttachment: (attachmentId: number) =>
    api.delete<{ message: string }>(`/admin/attachments/${attachmentId}`).then((r) => r.data),
};

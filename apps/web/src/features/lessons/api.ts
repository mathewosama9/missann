import { api } from '../../lib/api';
import type {
  LessonPlaybackDTO,
  LessonPlayDTO,
  ProgressInput,
  ProgressResultDTO,
  BunnyUploadDTO,
} from '@miss-ann/shared';

export interface BunnyVideoStatus {
  status: number; // 4 = جاهز، 5 = خطأ
  encodeProgress: number;
  ready: boolean;
  durationSec: number;
}

// ── طالب ─────────────────────────────────────────────────────────
export const lessonsApi = {
  // بيانات الحصة + المرفقات (يتحقق الاشتراك/المعاينة)
  access: (courseId: number | string, lessonId: number | string) =>
    api
      .get<{ lesson: LessonPlaybackDTO }>(`/courses/${courseId}/lessons/${lessonId}`)
      .then((r) => r.data.lesson),

  // رابط تشغيل موقّع قصير العمر + نص العلامة المائية
  play: (lessonId: number | string) =>
    api.get<LessonPlayDTO>(`/lessons/${lessonId}/play`).then((r) => r.data),

  progress: (lessonId: number | string, data: ProgressInput) =>
    api.post<ProgressResultDTO>(`/lessons/${lessonId}/progress`, data).then((r) => r.data),
};

// ── أدمن ─────────────────────────────────────────────────────────
export const bunnyAdminApi = {
  createVideo: (lessonId: number, title?: string) =>
    api.post<BunnyUploadDTO>('/admin/bunny/create-video', { lessonId, title }).then((r) => r.data),

  status: (lessonId: number) =>
    api.get<BunnyVideoStatus>(`/admin/bunny/lessons/${lessonId}/status`).then((r) => r.data),
};

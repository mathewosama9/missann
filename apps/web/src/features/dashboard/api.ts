import { api } from '../../lib/api';
import type { MyCourseDTO, StudentOverviewDTO } from '@miss-ann/shared';

// لوحة الطالب: بياناته هو فقط (الخادم يأخذ المعرّف من التوكن)
export const dashboardKeys = {
  overview: ['me', 'overview'] as const,
  courses: ['me', 'courses'] as const,
};

export const dashboardApi = {
  overview: () => api.get<StudentOverviewDTO>('/me/overview').then((r) => r.data),
  courses: () => api.get<{ items: MyCourseDTO[] }>('/me/courses').then((r) => r.data.items),
};

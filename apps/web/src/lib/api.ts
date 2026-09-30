import axios, { AxiosError } from 'axios';
import type { ApiError } from '@miss-ann/shared';
import { useAuth } from '../store/auth';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// حقن توكن الوصول في كل طلب
api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// تجديد الجلسة "طلب واحد في نفس الوقت": التوكن يُدوَّر مع كل تجديد، فطلبان متزامنان
// بنفس الكوكي يجعلان الثاني يفشل ويُخرج المستخدم (StrictMode في التطوير، أو عدة تبويبات/طلبات 401)
let refreshing: Promise<string | null> | null = null;
export function refreshSession(): Promise<string | null> {
  refreshing ??= refreshToken().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

// عند 401: حاول تجديد التوكن مرة واحدة ثم أعد الطلب
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      // طلب أُرسل بتوكن قديم بينما جدّد طلب آخر الجلسة ← نعيده بالتوكن الحالي بدون تجديد إضافي
      const sent = String(original.headers.Authorization ?? '');
      const current = useAuth.getState().accessToken;
      const newToken = current && sent !== `Bearer ${current}` ? current : await refreshSession();
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      useAuth.getState().clear();
    }
    return Promise.reject(error);
  },
);

async function refreshToken(): Promise<string | null> {
  try {
    const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
    useAuth.getState().setAccessToken(data.accessToken);
    return data.accessToken as string;
  } catch {
    return null;
  }
}

// استخراج رسالة خطأ عربية موحّدة
export function apiErrorMessage(err: unknown, fallback = 'حدث خطأ'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ApiError | undefined;
    return data?.message ?? fallback;
  }
  return fallback;
}

export function apiErrorFields(err: unknown): Record<string, string> | undefined {
  if (axios.isAxiosError(err)) return (err.response?.data as ApiError | undefined)?.fields;
  return undefined;
}

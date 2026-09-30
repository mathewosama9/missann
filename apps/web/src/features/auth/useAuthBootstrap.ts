import { useEffect } from 'react';
import { useAuth } from '../../store/auth';
import { authApi } from './api';
import { refreshSession } from '../../lib/api';

// عند بدء التطبيق: حاول تجديد الجلسة من الكوكي ثم اجلب بيانات المستخدم
export function useAuthBootstrap(): boolean {
  const isReady = useAuth((s) => s.isReady);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // refreshSession يشارك نفس الطلب لو استُدعي مرتين (StrictMode يشغّل الـ effect مرتين)
        const token = await refreshSession();
        if (!active || !token) return;
        const user = await authApi.me();
        if (active) useAuth.getState().setUser(user);
      } catch {
        /* لا توجد جلسة */
      } finally {
        if (active) useAuth.getState().setReady();
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return isReady;
}

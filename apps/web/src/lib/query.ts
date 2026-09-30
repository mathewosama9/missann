import { QueryClient } from '@tanstack/react-query';
import { useAuth } from '../store/auth';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

// تغيّر المستخدم: الخروج (أو انتهاء الجلسة) يمسح الكاش حتى لا تظهر بياناته (محفظة/اشتراكات)
// لمستخدم آخر؛ الدخول يعيد جلب ما عُرض كزائر (حالة الاشتراك في صفحة الكورس مثلاً)
useAuth.subscribe((state, prev) => {
  if (state.user?.id === prev.user?.id) return;
  if (prev.user) queryClient.clear();
  else void queryClient.invalidateQueries();
});

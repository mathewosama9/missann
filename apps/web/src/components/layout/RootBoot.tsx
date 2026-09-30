import { Outlet } from 'react-router-dom';
import { useAuthBootstrap } from '../../features/auth/useAuthBootstrap';

// يستعيد الجلسة مرة واحدة عند تحميل التطبيق قبل عرض المسارات
export function RootBoot() {
  useAuthBootstrap();
  return <Outlet />;
}

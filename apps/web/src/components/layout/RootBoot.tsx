import { Outlet, useNavigation } from 'react-router-dom';
import { useAuthBootstrap } from '../../features/auth/useAuthBootstrap';
import { Spinner } from '../ui/Spinner';

// يستعيد الجلسة مرة واحدة عند تحميل التطبيق قبل عرض المسارات
export function RootBoot() {
  useAuthBootstrap();
  // الصفحات تُحمَّل عند الحاجة: شريط رفيع أعلى الشاشة أثناء تحميل صفحة جديدة (الصفحة الحالية تبقى ظاهرة)
  const loading = useNavigation().state === 'loading';
  return (
    <>
      {loading && (
        <div className="fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-brand-100" role="progressbar" aria-label="جارٍ التحميل">
          <div className="h-full w-1/3 animate-pulse bg-brand-500" />
        </div>
      )}
      <Outlet />
    </>
  );
}

// أول فتح لرابط صفحة كسولة (قبل وصول ملفها)
export function RouteFallback() {
  return (
    <div className="grid min-h-screen place-items-center text-brand-600">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

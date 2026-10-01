import type { ComponentType, ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { RootBoot, RouteFallback } from '../components/layout/RootBoot';
import { PublicLayout } from '../components/layout/PublicLayout';
import { ProtectedRoute, AdminRoute, AdminOnly } from './guards';

// الصفحتان الأكثر دخولاً (الرئيسية والكتالوج) داخل الحزمة الأساسية؛ كل ما عداهما يُحمَّل عند الحاجة
// (لوحتا الطالب والأدمن والرسوم البيانية لا تثقل زيارة الزائر الأولى)
import { Home } from '../pages/Home';
import { Courses } from '../pages/Courses';

// مسار كسول: يحمّل ملف الصفحة ثم يعرض المكوّن المصدَّر بالاسم (مع غلاف حماية اختياري)
function page<M, K extends keyof M>(load: () => Promise<M>, name: K, wrap?: (el: ReactNode) => ReactNode) {
  return async () => {
    const Component = (await load())[name] as ComponentType;
    return { element: wrap ? wrap(<Component />) : <Component /> };
  };
}
const protect = (el: ReactNode) => <ProtectedRoute>{el}</ProtectedRoute>;
const adminOnly = (el: ReactNode) => <AdminOnly>{el}</AdminOnly>;

export const router = createBrowserRouter([
  {
    element: <RootBoot />,
    hydrateFallbackElement: <RouteFallback />,
    children: [
      // ── الموقع العام ──
      {
        element: <PublicLayout />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/courses', element: <Courses /> },
          { path: '/course/:id', lazy: page(() => import('../pages/CourseDetail'), 'CourseDetail') },
          { path: '/course/:id/lesson/:lessonId', lazy: page(() => import('../pages/LessonPlayer'), 'LessonPlayer', protect) },
          // عنوان العودة من Paymob (Transaction response callback)
          { path: '/payment/callback', lazy: page(() => import('../pages/PaymentCallback'), 'PaymentCallback', protect) },
          { path: '/about', lazy: page(() => import('../pages/About'), 'About') },
          { path: '/contact', lazy: page(() => import('../pages/Contact'), 'Contact') },
          { path: '*', lazy: page(() => import('../pages/NotFound'), 'NotFound') },
        ],
      },
      // ── صفحات المصادقة ──
      { path: '/login', lazy: page(() => import('../pages/Login'), 'Login') },
      { path: '/register', lazy: page(() => import('../pages/Register'), 'Register') },
      { path: '/verify', lazy: page(() => import('../pages/Verify'), 'Verify') },
      { path: '/forgot-password', lazy: page(() => import('../pages/ForgotPassword'), 'ForgotPassword') },
      { path: '/reset-password', lazy: page(() => import('../pages/ResetPassword'), 'ResetPassword') },

      // ── مشغّل الامتحان: شاشة مركّزة بلا قوائم جانبية ──
      { path: '/exam/:examId', lazy: page(() => import('../pages/ExamRunner'), 'ExamRunner', protect) },

      // ── لوحة الطالب ──
      {
        path: '/dashboard',
        lazy: page(() => import('../pages/dashboard/StudentLayout'), 'StudentLayout', protect),
        children: [
          { index: true, lazy: page(() => import('../pages/dashboard/Overview'), 'StudentOverview') },
          { path: 'courses', lazy: page(() => import('../pages/dashboard/MyCourses'), 'MyCourses') },
          { path: 'wallet', lazy: page(() => import('../pages/dashboard/Wallet'), 'WalletPage') },
          { path: 'exams', lazy: page(() => import('../pages/dashboard/Exams'), 'ExamsPage') },
          { path: 'exams/result/:attemptId', lazy: page(() => import('../pages/dashboard/ExamResult'), 'ExamResult') },
          { path: 'homework', lazy: page(() => import('../pages/dashboard/Homework'), 'HomeworkPage') },
          { path: 'live', lazy: page(() => import('../pages/dashboard/Live'), 'LivePage') },
          { path: 'notifications', lazy: page(() => import('../pages/dashboard/Notifications'), 'NotificationsPage') },
          { path: 'profile', lazy: page(() => import('../pages/dashboard/Profile'), 'Profile') },
        ],
      },

      // ── لوحة الأدمن ──
      {
        path: '/admin',
        lazy: page(() => import('../pages/admin/AdminLayout'), 'AdminLayout', (el) => <AdminRoute>{el}</AdminRoute>),
        children: [
          { index: true, lazy: page(() => import('../pages/admin/AdminOverview'), 'AdminOverview') },
          // أقسام الأدمن فقط (الـ API يرفض المساعد أيضاً)
          { path: 'students', lazy: page(() => import('../pages/admin/AdminStudents'), 'AdminStudents', adminOnly) },
          { path: 'students/:id', lazy: page(() => import('../pages/admin/AdminStudentDetail'), 'AdminStudentDetail', adminOnly) },
          { path: 'courses', lazy: page(() => import('../pages/admin/AdminCourses'), 'AdminCourses') },
          { path: 'courses/:id', lazy: page(() => import('../pages/admin/AdminCourseLessons'), 'AdminCourseLessons') },
          { path: 'codes', lazy: page(() => import('../pages/admin/AdminCodes'), 'AdminCodes', adminOnly) },
          { path: 'payments', lazy: page(() => import('../pages/admin/AdminPayments'), 'AdminPayments', adminOnly) },
          { path: 'exams', lazy: page(() => import('../pages/admin/AdminExams'), 'AdminExams') },
          { path: 'exams/:id', lazy: page(() => import('../pages/admin/AdminExamBuilder'), 'AdminExamBuilder') },
          { path: 'exams/:id/analytics', lazy: page(() => import('../pages/admin/AdminExamAnalytics'), 'AdminExamAnalytics') },
          { path: 'exams/:id/attempts/:attemptId', lazy: page(() => import('../pages/admin/AdminExamGrading'), 'AdminExamGrading') },
          { path: 'homework', lazy: page(() => import('../pages/admin/AdminHomework'), 'AdminHomework') },
          { path: 'homework/:id', lazy: page(() => import('../pages/admin/AdminHomeworkSubmissions'), 'AdminHomeworkSubmissions') },
          { path: 'live', lazy: page(() => import('../pages/admin/AdminLive'), 'AdminLive') },
          { path: 'notifications', lazy: page(() => import('../pages/admin/AdminNotifications'), 'AdminNotifications') },
          { path: 'settings', lazy: page(() => import('../pages/admin/AdminSettings'), 'AdminSettings', adminOnly) },
        ],
      },
    ],
  },
]);

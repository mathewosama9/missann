import { createBrowserRouter } from 'react-router-dom';
import { RootBoot } from '../components/layout/RootBoot';
import { PublicLayout } from '../components/layout/PublicLayout';
import { ProtectedRoute, AdminRoute, AdminOnly } from './guards';

import { Home } from '../pages/Home';
import { Courses } from '../pages/Courses';
import { CourseDetail } from '../pages/CourseDetail';
import { LessonPlayer } from '../pages/LessonPlayer';
import { PaymentCallback } from '../pages/PaymentCallback';
import { ExamRunner } from '../pages/ExamRunner';
import { About } from '../pages/About';
import { Contact } from '../pages/Contact';
import { Login } from '../pages/Login';
import { Register } from '../pages/Register';
import { Verify } from '../pages/Verify';
import { ForgotPassword } from '../pages/ForgotPassword';
import { ResetPassword } from '../pages/ResetPassword';
import { NotFound } from '../pages/NotFound';

import { StudentLayout } from '../pages/dashboard/StudentLayout';
import { StudentOverview } from '../pages/dashboard/Overview';
import { Profile } from '../pages/dashboard/Profile';
import { MyCourses } from '../pages/dashboard/MyCourses';
import { WalletPage } from '../pages/dashboard/Wallet';
import { ExamsPage } from '../pages/dashboard/Exams';
import { ExamResult } from '../pages/dashboard/ExamResult';
import { HomeworkPage } from '../pages/dashboard/Homework';
import { LivePage } from '../pages/dashboard/Live';
import { NotificationsPage } from '../pages/dashboard/Notifications';

import { AdminLayout } from '../pages/admin/AdminLayout';
import { AdminOverview } from '../pages/admin/AdminOverview';
import { AdminCourses } from '../pages/admin/AdminCourses';
import { AdminCourseLessons } from '../pages/admin/AdminCourseLessons';
import { AdminCodes } from '../pages/admin/AdminCodes';
import { AdminPayments } from '../pages/admin/AdminPayments';
import { AdminExams } from '../pages/admin/AdminExams';
import { AdminExamBuilder } from '../pages/admin/AdminExamBuilder';
import { AdminExamAnalytics } from '../pages/admin/AdminExamAnalytics';
import { AdminExamGrading } from '../pages/admin/AdminExamGrading';
import { AdminHomework } from '../pages/admin/AdminHomework';
import { AdminHomeworkSubmissions } from '../pages/admin/AdminHomeworkSubmissions';
import { AdminLive } from '../pages/admin/AdminLive';
import { AdminNotifications } from '../pages/admin/AdminNotifications';
import { AdminStudents } from '../pages/admin/AdminStudents';
import { AdminStudentDetail } from '../pages/admin/AdminStudentDetail';
import { AdminSettings } from '../pages/admin/AdminSettings';

export const router = createBrowserRouter([
  {
    element: <RootBoot />,
    children: [
      // ── الموقع العام ──
      {
        element: <PublicLayout />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/courses', element: <Courses /> },
          { path: '/course/:id', element: <CourseDetail /> },
          {
            path: '/course/:id/lesson/:lessonId',
            element: (
              <ProtectedRoute>
                <LessonPlayer />
              </ProtectedRoute>
            ),
          },
          {
            // عنوان العودة من Paymob (Transaction response callback)
            path: '/payment/callback',
            element: (
              <ProtectedRoute>
                <PaymentCallback />
              </ProtectedRoute>
            ),
          },
          { path: '/about', element: <About /> },
          { path: '/contact', element: <Contact /> },
          { path: '*', element: <NotFound /> },
        ],
      },
      // ── صفحات المصادقة ──
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
      { path: '/verify', element: <Verify /> },
      { path: '/forgot-password', element: <ForgotPassword /> },
      { path: '/reset-password', element: <ResetPassword /> },

      // ── مشغّل الامتحان: شاشة مركّزة بلا قوائم جانبية ──
      {
        path: '/exam/:examId',
        element: (
          <ProtectedRoute>
            <ExamRunner />
          </ProtectedRoute>
        ),
      },

      // ── لوحة الطالب ──
      {
        path: '/dashboard',
        element: (
          <ProtectedRoute>
            <StudentLayout />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <StudentOverview /> },
          { path: 'courses', element: <MyCourses /> },
          { path: 'wallet', element: <WalletPage /> },
          { path: 'exams', element: <ExamsPage /> },
          { path: 'exams/result/:attemptId', element: <ExamResult /> },
          { path: 'homework', element: <HomeworkPage /> },
          { path: 'live', element: <LivePage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'profile', element: <Profile /> },
        ],
      },

      // ── لوحة الأدمن ──
      {
        path: '/admin',
        element: (
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        ),
        children: [
          { index: true, element: <AdminOverview /> },
          // أقسام الأدمن فقط (الـ API يرفض المساعد أيضاً)
          { path: 'students', element: <AdminOnly><AdminStudents /></AdminOnly> },
          { path: 'students/:id', element: <AdminOnly><AdminStudentDetail /></AdminOnly> },
          { path: 'courses', element: <AdminCourses /> },
          { path: 'courses/:id', element: <AdminCourseLessons /> },
          { path: 'codes', element: <AdminOnly><AdminCodes /></AdminOnly> },
          { path: 'payments', element: <AdminOnly><AdminPayments /></AdminOnly> },
          { path: 'exams', element: <AdminExams /> },
          { path: 'exams/:id', element: <AdminExamBuilder /> },
          { path: 'exams/:id/analytics', element: <AdminExamAnalytics /> },
          { path: 'exams/:id/attempts/:attemptId', element: <AdminExamGrading /> },
          { path: 'homework', element: <AdminHomework /> },
          { path: 'homework/:id', element: <AdminHomeworkSubmissions /> },
          { path: 'live', element: <AdminLive /> },
          { path: 'notifications', element: <AdminNotifications /> },
          { path: 'settings', element: <AdminOnly><AdminSettings /></AdminOnly> },
        ],
      },
    ],
  },
]);

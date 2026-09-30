import { LayoutDashboard, BookOpen, Wallet, ClipboardList, FileText, Video, Bell, User } from 'lucide-react';
import { DashboardLayout, type NavItem } from '../../components/layout/DashboardLayout';

const items: NavItem[] = [
  { to: '/dashboard', label: 'نظرة عامة', icon: LayoutDashboard, end: true },
  { to: '/dashboard/courses', label: 'كورساتي', icon: BookOpen },
  { to: '/dashboard/wallet', label: 'المحفظة', icon: Wallet },
  { to: '/dashboard/exams', label: 'الامتحانات', icon: ClipboardList },
  { to: '/dashboard/homework', label: 'الواجبات', icon: FileText },
  { to: '/dashboard/live', label: 'الحصص اللايف', icon: Video },
  { to: '/dashboard/notifications', label: 'الإشعارات', icon: Bell },
  { to: '/dashboard/profile', label: 'الملف الشخصي', icon: User },
];

export function StudentLayout() {
  return <DashboardLayout items={items} title="لوحة الطالب" notificationsHref="/dashboard/notifications" />;
}

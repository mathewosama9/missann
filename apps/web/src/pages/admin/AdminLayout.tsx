import {
  LayoutDashboard, Users, BookOpen, Ticket, CreditCard,
  ClipboardList, FileText, Video, Bell, Settings,
} from 'lucide-react';
import { DashboardLayout, type NavItem } from '../../components/layout/DashboardLayout';

const items: NavItem[] = [
  { to: '/admin', label: 'لوحة القيادة', icon: LayoutDashboard, end: true },
  { to: '/admin/students', label: 'الطلاب', icon: Users },
  { to: '/admin/courses', label: 'الكورسات والحصص', icon: BookOpen },
  { to: '/admin/codes', label: 'كروت الشحن', icon: Ticket },
  { to: '/admin/payments', label: 'المدفوعات', icon: CreditCard },
  { to: '/admin/exams', label: 'الامتحانات', icon: ClipboardList },
  { to: '/admin/homework', label: 'الواجبات', icon: FileText },
  { to: '/admin/live', label: 'الحصص اللايف', icon: Video },
  { to: '/admin/notifications', label: 'الإشعارات', icon: Bell },
  { to: '/admin/settings', label: 'الإعدادات', icon: Settings },
];

export function AdminLayout() {
  return <DashboardLayout items={items} title="لوحة الأدمن" />;
}

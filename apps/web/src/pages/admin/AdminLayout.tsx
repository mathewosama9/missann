import {
  LayoutDashboard, Users, BookOpen, Ticket, CreditCard,
  ClipboardList, FileText, Video, Bell, Settings,
} from 'lucide-react';
import { DashboardLayout, type NavItem } from '../../components/layout/DashboardLayout';

// المساعد يرى أقسام المحتوى والتصحيح فقط (نفس صلاحياته في الـ API)
const adminOnly = ['ADMIN'] as const;
const items: NavItem[] = [
  { to: '/admin', label: 'لوحة القيادة', icon: LayoutDashboard, end: true },
  { to: '/admin/students', label: 'الطلاب', icon: Users, roles: adminOnly },
  { to: '/admin/courses', label: 'الكورسات والحصص', icon: BookOpen },
  { to: '/admin/codes', label: 'كروت الشحن', icon: Ticket, roles: adminOnly },
  { to: '/admin/payments', label: 'المدفوعات', icon: CreditCard, roles: adminOnly },
  { to: '/admin/exams', label: 'الامتحانات', icon: ClipboardList },
  { to: '/admin/homework', label: 'الواجبات', icon: FileText },
  { to: '/admin/live', label: 'الحصص اللايف', icon: Video },
  { to: '/admin/notifications', label: 'الإشعارات', icon: Bell, roles: adminOnly },
  { to: '/admin/settings', label: 'الإعدادات', icon: Settings, roles: adminOnly },
];

export function AdminLayout() {
  return <DashboardLayout items={items} title="لوحة الأدمن" />;
}

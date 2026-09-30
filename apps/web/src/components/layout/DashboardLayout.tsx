import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { Menu, X, LogOut, Globe, type LucideIcon } from 'lucide-react';
import { useAuth } from '../../store/auth';
import { useLogout } from '../../features/auth/useLogout';
import { LogoMark } from '../brand/Logo';
import { NotificationBell } from '../../features/notifications/NotificationBell';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

// notificationsHref: صفحة كل الإشعارات (رابط أسفل قائمة الجرس) — اختياري
export function DashboardLayout({ items, title, notificationsHref }: { items: NavItem[]; title: string; notificationsHref?: string }) {
  const [open, setOpen] = useState(false);
  const user = useAuth((s) => s.user);
  const logout = useLogout();

  return (
    <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[272px_1fr]">
      {/* الشريط الجانبي */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-[272px] transform flex-col bg-ink-900 text-paper transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex h-20 items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-3">
            <LogoMark tone="light" className="h-10 w-10" />
            <span className="flex flex-col leading-tight">
              <span className="font-display text-base font-extrabold">{title}</span>
              <span className="text-[11px] text-paper/50">مس آن بهاء</span>
            </span>
          </Link>
          <button className="text-paper/70 lg:hidden" onClick={() => setOpen(false)} aria-label="إغلاق">
            <X size={20} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-lime-300 text-ink-900' : 'text-paper/65 hover:bg-paper/5 hover:text-paper'
                }`
              }
            >
              <it.icon size={18} strokeWidth={2} />
              {it.label}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-1 border-t border-paper/10 p-3">
          <Link to="/" className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-paper/65 hover:bg-paper/5 hover:text-paper">
            <Globe size={18} /> الموقع الرئيسي
          </Link>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-coral-300 hover:bg-coral-500/10"
          >
            <LogOut size={18} /> تسجيل الخروج
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-40 bg-ink-950/50 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />}

      {/* المحتوى */}
      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-20 items-center justify-between gap-3 border-b border-ink-900/[0.06] bg-paper/85 px-4 backdrop-blur-md sm:px-8">
          <button className="btn-icon lg:hidden" onClick={() => setOpen(true)} aria-label="القائمة">
            <Menu size={18} />
          </button>
          <div className="mr-auto flex items-center gap-3">
            <NotificationBell allHref={notificationsHref} />
            <div className="hidden text-left sm:block">
              <div className="text-sm font-semibold text-ink-900">{user?.name}</div>
              <div className="text-xs text-ink-400" dir="ltr">{user?.phone}</div>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-full border-2 border-ink-900 bg-lime-300 font-display text-lg font-extrabold text-ink-900">
              {user?.name?.charAt(0) ?? '؟'}
            </span>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X, Phone, LogIn, ArrowUpLeft, LayoutDashboard } from 'lucide-react';
import { PLATFORM } from '@miss-ann/shared';
import { useAuth } from '../../store/auth';
import { Logo } from '../brand/Logo';

const navItems = [
  { to: '/', label: 'الرئيسية' },
  { to: '/courses', label: 'الكورسات' },
  { to: '/about', label: 'عن مس آن' },
  { to: '/contact', label: 'تواصل معنا' },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const user = useAuth((s) => s.user);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const dashTo = user?.role === 'STUDENT' ? '/dashboard' : '/admin';

  return (
    <header className="sticky top-0 z-40 px-3 pt-3">
      <div
        className={`container-app flex h-16 items-center justify-between gap-4 rounded-full border transition ${
          scrolled ? 'border-ink-900/10 bg-paper-50/85 shadow-soft backdrop-blur-md' : 'border-transparent bg-transparent'
        }`}
      >
        <Logo />

        <nav className="hidden items-center gap-1 rounded-full border border-ink-900/10 bg-white/60 p-1 md:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  isActive ? 'bg-ink-900 text-paper' : 'text-ink-600 hover:text-ink-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <a href={`tel:${PLATFORM.bookingPhone}`} className="btn-icon" aria-label="اتصل بنا" title={PLATFORM.bookingPhone}>
            <Phone size={17} />
          </a>
          {user ? (
            <Link to={dashTo} className="btn-dark text-sm">
              <LayoutDashboard size={16} /> لوحتي
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn text-sm text-ink-700 hover:text-ink-900">
                <LogIn size={16} /> دخول
              </Link>
              <Link to="/register" className="btn-accent text-sm">
                ابدأ الآن <ArrowUpLeft size={16} />
              </Link>
            </>
          )}
        </div>

        <button className="btn-icon md:hidden" onClick={() => setOpen((v) => !v)} aria-label="القائمة" aria-expanded={open}>
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {open && (
        <div className="container-app mt-2 md:hidden">
          <div className="card animate-pop flex flex-col gap-1 p-3">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `rounded-2xl px-4 py-3 font-medium ${isActive ? 'bg-ink-900 text-paper' : 'text-ink-700 hover:bg-paper'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <a href={`tel:${PLATFORM.bookingPhone}`} className="btn-ghost mt-2" dir="ltr">
              <Phone size={16} /> {PLATFORM.bookingPhone}
            </a>
            {user ? (
              <Link to={dashTo} className="btn-dark">
                <LayoutDashboard size={16} /> لوحتي
              </Link>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link to="/login" className="btn-ghost">دخول</Link>
                <Link to="/register" className="btn-accent">حساب جديد</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

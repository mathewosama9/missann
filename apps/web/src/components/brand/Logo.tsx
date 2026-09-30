import { Link } from 'react-router-dom';
import { PLATFORM } from '@miss-ann/shared';

// شعار على هيئة خانة عنصر في الجدول الدوري
export function LogoMark({ className = 'h-11 w-11', tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  const dark = tone === 'dark';
  return (
    <span
      className={`relative grid shrink-0 place-items-center rounded-xl ${
        dark ? 'bg-ink-900 text-lime-300' : 'bg-lime-300 text-ink-900'
      } ${className}`}
      aria-hidden
    >
      <span className="font-display text-lg font-extrabold leading-none">آن</span>
    </span>
  );
}

export function Logo({ tone = 'dark', to = '/' }: { tone?: 'dark' | 'light'; to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-3">
      <LogoMark tone={tone} />
      <span className="flex flex-col leading-tight">
        <span className={`font-display text-lg font-extrabold ${tone === 'dark' ? 'text-ink-900' : 'text-paper'}`}>
          {PLATFORM.name}
        </span>
        <span className={`text-[11px] ${tone === 'dark' ? 'text-ink-400' : 'text-paper/60'}`}>
          معمل العلوم الصغير
        </span>
      </span>
    </Link>
  );
}

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, PlayCircle, Timer, BellRing } from 'lucide-react';
import { AtomArt } from '../../components/ScienceArt';
import { Logo } from '../../components/brand/Logo';
import { GRADE_META } from '../courses/gradeMeta';

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      {/* لوحة الهوية */}
      <aside className="relative m-3 hidden overflow-hidden rounded-4xl bg-ink-900 p-10 text-paper lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
        {/* ذرّة كبيرة خارجة من الركن كخلفية حيّة */}
        <AtomArt tone="dark" className="absolute -left-44 -top-36 w-[540px] opacity-75" />

        <div className="relative flex items-start justify-between">
          <Logo tone="light" />
        </div>

        {/* بطاقات عائمة من داخل المنصة */}
        <div className="pointer-events-none relative mx-auto mt-auto h-64 w-full max-w-md">
          <MiniCard
            className="right-0 top-0"
            tilt="rotate-[-3deg]"
            stamp="shadow-[5px_5px_0_0_#CDEB3C]"
            icon={<PlayCircle size={17} />}
            iconBg="bg-ink-900 text-lime-300"
            title="الحصة الجاية"
            sub="الوحدة الأولى · ٢٠ دقيقة"
          >
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink-900/10">
              <div className="h-full w-2/3 rounded-full bg-brand-500" />
            </div>
          </MiniCard>
          <MiniCard
            className="left-0 top-24 [animation-delay:1.2s]"
            tilt="rotate-[3deg]"
            stamp="shadow-[5px_5px_0_0_#FF835F]"
            icon={<Timer size={17} />}
            iconBg="bg-brand-500 text-white"
            title="كويز الحصة"
            sub="١٠ / ١٠ درجات"
          />
          <MiniCard
            className="bottom-0 right-10 [animation-delay:2.4s]"
            tilt="rotate-[-1deg]"
            stamp="shadow-[5px_5px_0_0_#8E9FFF]"
            icon={<BellRing size={17} />}
            iconBg="bg-coral-400 text-ink-900"
            title="إشعار لولي الأمر"
            sub="تم إرسال الدرجة"
          />
        </div>

        <div className="relative mt-12">
          <h2 className="font-display text-4xl font-extrabold leading-snug">
            كل حصة <span className="text-lime-300">تجربة جديدة</span>
            <br />
            في معمل العلوم.
          </h2>
          <div className="mt-8 flex items-center gap-4">
            <div className="flex gap-2">
              {Object.values(GRADE_META).map((m, i) => (
                <span
                  key={m.code}
                  className={`relative grid h-14 w-14 place-items-center rounded-xl ${m.tile} ${['rotate-[-6deg]', 'rotate-[3deg]', 'rotate-[-2deg]'][i]}`}
                >
                  <span className="absolute right-1 top-0.5 text-[8px] font-semibold opacity-60">{m.code}</span>
                  <span className="font-display text-2xl font-extrabold leading-none">{m.num}</span>
                </span>
              ))}
            </div>
            <p className="text-sm leading-6 text-paper/60">
              فيديوهات، امتحانات ومتابعة لولي الأمر
              <br />
              للصف الرابع والخامس والسادس الابتدائي
            </p>
          </div>
        </div>
      </aside>

      {/* النموذج */}
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <div className="lg:hidden">
            <Logo />
          </div>
          <Link to="/" className="mr-auto flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
            <ArrowRight size={16} /> الرئيسية
          </Link>
        </div>

        <div className="mx-auto my-auto w-full max-w-md py-10">
          <h1 className="font-display text-4xl font-extrabold text-ink-900">{title}</h1>
          {subtitle && <p className="mt-2 text-ink-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && (
            <div className="mt-8 border-t border-dashed border-ink-900/15 pt-6 text-center text-sm text-ink-500">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniCard({
  className,
  tilt,
  stamp,
  icon,
  iconBg,
  title,
  sub,
  children,
}: {
  className: string;
  tilt: string;
  stamp: string;
  icon: ReactNode;
  iconBg: string;
  title: string;
  sub: string;
  children?: ReactNode;
}) {
  return (
    <div className={`absolute w-60 animate-float ${className}`}>
      <div className={`rounded-2xl border-2 border-ink-900 bg-paper p-3.5 text-ink-900 ${tilt} ${stamp}`}>
        <div className="flex items-center gap-3">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${iconBg}`}>{icon}</span>
          <div>
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-xs text-ink-500">{sub}</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

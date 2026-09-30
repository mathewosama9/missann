import { Phone, MessageCircle, Globe2, ArrowUpLeft, CalendarCheck } from 'lucide-react';
import { PLATFORM } from '@miss-ann/shared';

export function Contact() {
  return (
    <div className="container-app pt-10">
      <div className="max-w-2xl">
        <span className="eyebrow">تواصل معنا</span>
        <h1 className="mt-4 font-display text-5xl font-extrabold leading-[1.2] text-ink-900">
          نسمعك في <span className="marker">أي وقت</span>
        </h1>
        <p className="mt-4 text-lg text-ink-500">للحجز والاستفسار عن الكورسات تواصل معنا مباشرة.</p>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-3">
        <a
          href={`https://wa.me/${PLATFORM.whatsapp}`}
          target="_blank"
          rel="noreferrer"
          className="group relative flex flex-col overflow-hidden rounded-4xl border-2 border-ink-900 bg-lime-300 p-7 shadow-stamp transition hover:-translate-y-1 md:row-span-2"
        >
          <span className="grid h-14 w-14 place-items-center rounded-full bg-ink-900 text-lime-300">
            <MessageCircle size={24} />
          </span>
          <h2 className="mt-auto pt-16 text-3xl font-extrabold text-ink-900">واتساب</h2>
          <p className="mt-1 text-ink-700">أسرع طريقة للرد — ابعت رسالتك الآن.</p>
          <span className="mt-6 inline-flex items-center gap-2 font-semibold text-ink-900">
            ابدأ المحادثة
            <ArrowUpLeft size={18} className="transition group-hover:-translate-x-1 group-hover:-translate-y-1" />
          </span>
        </a>

        <a href={`tel:${PLATFORM.bookingPhone}`} className="card card-hover flex items-center gap-5 p-6 md:col-span-2">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-500 text-white">
            <Phone size={22} />
          </span>
          <div>
            <div className="text-sm text-ink-400">اتصال / حجز</div>
            <div className="font-display text-2xl font-extrabold text-ink-900" dir="ltr">{PLATFORM.bookingPhone}</div>
          </div>
        </a>

        <div className="card flex items-center gap-5 p-6">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-coral-400 text-ink-900">
            <Globe2 size={22} />
          </span>
          <div>
            <div className="font-semibold text-ink-900">منصة أونلاين</div>
            <div className="text-sm text-ink-500">تعلّم من أي مكان</div>
          </div>
        </div>

        <div className="card flex items-center gap-5 p-6">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-paper-100 text-ink-900">
            <CalendarCheck size={22} />
          </span>
          <div>
            <div className="font-semibold text-ink-900">حجز الكورسات</div>
            <div className="text-sm text-ink-500">اتصل أو راسلنا لتأكيد الحجز</div>
          </div>
        </div>
      </div>
    </div>
  );
}

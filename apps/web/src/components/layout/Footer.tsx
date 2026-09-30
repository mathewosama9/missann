import { Link } from 'react-router-dom';
import { Phone, MessageCircle, Facebook, Youtube, ArrowUpLeft, Linkedin } from 'lucide-react';
import { PLATFORM } from '@miss-ann/shared';
import { Logo } from '../brand/Logo';

export function Footer() {
  return (
    <footer className="px-3 pb-3">
      <div className="relative overflow-hidden rounded-4xl bg-ink-900 text-paper">
        <div className="pointer-events-none absolute inset-0 bg-dots opacity-[0.15] invert" />

        <div className="container-app relative py-14">
          {/* دعوة للتسجيل */}
          <div className="flex flex-col items-start justify-between gap-6 border-b border-paper/10 pb-10 md:flex-row md:items-end">
            <h2 className="max-w-xl font-display text-3xl font-extrabold leading-snug md:text-4xl">
              جاهز تبدأ أول تجربة في <span className="text-lime-300">معمل العلوم</span>؟
            </h2>
            <Link to="/register" className="btn-accent text-base">
              أنشئ حساب الطالب <ArrowUpLeft size={18} />
            </Link>
          </div>

          <div className="grid gap-10 pt-10 md:grid-cols-12">
            <div className="md:col-span-5">
              <Logo tone="light" />
              <p className="mt-4 max-w-sm text-sm leading-7 text-paper/60">
                {PLATFORM.tagline} — نتعلّم العلوم بطريقة مبسّطة وممتعة لطلاب الصف الرابع والخامس والسادس الابتدائي.
              </p>
            </div>
            <div className="md:col-span-3">
              <h4 className="mb-4 text-xs font-semibold tracking-wide text-paper/40">روابط</h4>
              <ul className="space-y-2.5 text-sm">
                <li><Link to="/courses" className="text-paper/80 hover:text-lime-300">الكورسات</Link></li>
                <li><Link to="/about" className="text-paper/80 hover:text-lime-300">عن مس آن</Link></li>
                <li><Link to="/contact" className="text-paper/80 hover:text-lime-300">تواصل معنا</Link></li>
                <li><Link to="/login" className="text-paper/80 hover:text-lime-300">تسجيل الدخول</Link></li>
              </ul>
            </div>
            <div className="md:col-span-4">
              <h4 className="mb-4 text-xs font-semibold tracking-wide text-paper/40">تواصل</h4>
              <a href={`tel:${PLATFORM.bookingPhone}`} className="mb-3 flex items-center gap-3 text-sm text-paper/80 hover:text-lime-300">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-paper/10"><Phone size={16} /></span>
                <span dir="ltr">{PLATFORM.bookingPhone}</span>
              </a>
              <a href={`https://wa.me/${PLATFORM.whatsapp}`} target="_blank" rel="noreferrer" className="mb-5 flex items-center gap-3 text-sm text-paper/80 hover:text-lime-300">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-paper/10"><MessageCircle size={16} /></span>
                واتساب
              </a>
              <div className="flex gap-2">
                <a href="#" aria-label="فيسبوك" className="grid h-10 w-10 place-items-center rounded-full border border-paper/15 transition hover:border-lime-300 hover:text-lime-300"><Facebook size={17} /></a>
                <a href="#" aria-label="يوتيوب" className="grid h-10 w-10 place-items-center rounded-full border border-paper/15 transition hover:border-lime-300 hover:text-lime-300"><Youtube size={17} /></a>
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-paper/10 pt-6 text-xs text-paper/40 sm:flex-row sm:items-center">
            <div className="flex flex-col gap-1">
              <span>© {new Date().getFullYear()} {PLATFORM.name} — جميع الحقوق محفوظة</span>
              <span className="text-paper/30">صُمّم للصغار… بعناية الكبار</span>
            </div>
            <a
              href="https://www.linkedin.com/in/mathewosama/"
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center gap-2.5 rounded-full border border-paper/15 py-1.5 pe-1.5 ps-4 text-paper/60 transition hover:border-lime-300"
            >
              <span>
                تصميم وتطوير{' '}
                <span className="font-display text-sm font-extrabold text-paper transition group-hover:text-lime-300">
                  ماثيو أسامة
                </span>
              </span>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-paper/10 text-paper transition group-hover:bg-lime-300 group-hover:text-ink-900">
                <Linkedin size={14} />
              </span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

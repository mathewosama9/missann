import { MessageCircle } from 'lucide-react';
import { PLATFORM } from '@miss-ann/shared';

// زر واتساب عائم للحجز — دائرة صغيرة يظهر نصها عند المرور حتى لا يغطي المحتوى
export function WhatsAppFab() {
  return (
    <a
      href={`https://wa.me/${PLATFORM.whatsapp}`}
      target="_blank"
      rel="noreferrer"
      className="group fixed bottom-5 left-5 z-40 flex items-center rounded-full border-2 border-ink-900 bg-lime-300 p-1 font-semibold text-ink-900 shadow-stamp transition hover:-translate-y-0.5"
      aria-label="احجز الآن عبر واتساب"
    >
      <span className="grid h-10 w-10 place-items-center rounded-full bg-ink-900 text-lime-300">
        <MessageCircle size={19} />
      </span>
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm transition-all duration-300 group-hover:max-w-[6rem] group-hover:pe-3 group-hover:ps-2 group-focus-visible:max-w-[6rem] group-focus-visible:pe-3 group-focus-visible:ps-2">
        احجز الآن
      </span>
    </a>
  );
}

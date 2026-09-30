import { Atom } from './Atom';

// رسومات SVG أصلية بأسلوب الخط اليدوي (حبر داكن + تعبئة مسطحة)
const INK = '#131629';

// الذرّة أصبحت مكوّن canvas متحرك ثلاثي الأبعاد
export function AtomArt(props: { className?: string; tone?: 'light' | 'dark' }) {
  return <Atom {...props} />;
}

// نسخة ثابتة بنفس أسلوب الدورق والميكروسكوب (لكروت الصفوف)
export function AtomIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 240" className={className} aria-hidden>
      <g fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round">
        <ellipse cx="120" cy="120" rx="98" ry="36" />
        <ellipse cx="120" cy="120" rx="98" ry="36" transform="rotate(60 120 120)" />
        <ellipse cx="120" cy="120" rx="98" ry="36" transform="rotate(120 120 120)" />
      </g>
      <circle cx="120" cy="120" r="24" fill="#CDEB3C" stroke={INK} strokeWidth="7" />
      <circle cx="112" cy="112" r="6" fill="#fff" />
      <circle cx="218" cy="120" r="12" fill="#3D55F5" stroke={INK} strokeWidth="6" />
      <circle cx="71" cy="35" r="12" fill="#F4643B" stroke={INK} strokeWidth="6" />
      <circle cx="71" cy="205" r="12" fill="#FBF7EE" stroke={INK} strokeWidth="6" />
    </svg>
  );
}

export function FlaskArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <path d="M40 76h40l12 20a8 8 0 0 1-7 12H35a8 8 0 0 1-7-12z" fill="#CDEB3C" />
      <path
        d="M49 14h22M52 14v32L27 92a11 11 0 0 0 10 16h46a11 11 0 0 0 10-16L68 46V14"
        fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M38 76h44" stroke={INK} strokeWidth="3" strokeLinecap="round" strokeDasharray="2 7" />
      <circle cx="52" cy="92" r="4" fill="#fff" stroke={INK} strokeWidth="2" />
      <circle cx="67" cy="98" r="3" fill="#fff" stroke={INK} strokeWidth="2" />
      <circle cx="78" cy="34" r="4" fill="none" stroke={INK} strokeWidth="2.5" />
      <circle cx="86" cy="22" r="2.5" fill={INK} />
    </svg>
  );
}

export function MicroscopeArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <rect x="26" y="96" width="68" height="10" rx="5" fill="#F4643B" stroke={INK} strokeWidth="3" />
      <path d="M52 22l20 10-20 40-18-9z" fill="#3D55F5" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <rect x="44" y="12" width="18" height="10" rx="3" transform="rotate(27 53 17)" fill="#CDEB3C" stroke={INK} strokeWidth="3" />
      <path d="M74 60c14 6 18 22 12 36" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M40 84h34" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M58 72v12" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

export function LeafArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <path d="M24 96C24 50 54 22 100 20c0 46-28 76-76 76z" fill="#CDEB3C" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M24 96L78 42M48 72V54M60 60h16" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// خط متعرّج صغير للزينة
export function Squiggle({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 16" className={className} aria-hidden>
      <path d="M2 8c10-10 18 10 28 0s18 10 28 0 18 10 28 0 18 10 28 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

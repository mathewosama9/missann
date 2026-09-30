import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

// تبويبات بشكل حبّة — تتمرر أفقياً داخلها فقط على الشاشات الضيقة.
// نمط WAI-ARIA: التبويب المختار وحده في ترتيب Tab، والأسهم/Home/End تنقل بينها (في RTL السهم الأيسر = التالي)،
// واللوحة role="tabpanel" مربوطة بتبويبها.
export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  children,
  panelClassName = 'mt-6',
}: {
  tabs: readonly (readonly [K, string])[];
  value: K;
  onChange: (k: K) => void;
  children: ReactNode;
  panelClassName?: string;
}) {
  const base = useId();
  const refs = useRef(new Map<K, HTMLButtonElement>());
  const tabId = (k: K) => `${base}-tab-${k}`;
  const panelId = `${base}-panel`;

  const onKeyDown = (e: KeyboardEvent) => {
    const i = tabs.findIndex(([k]) => k === value);
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const step: Record<string, number> = { ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1 };
    let next: number | null = null;
    if (e.key in step) next = (i + step[e.key]! + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    const key = tabs[next]![0];
    onChange(key);
    refs.current.get(key)?.focus();
  };

  return (
    <>
      <div className="flex max-w-full overflow-x-auto">
        <div className="inline-flex shrink-0 rounded-full border border-ink-900/10 bg-white p-1" role="tablist" onKeyDown={onKeyDown}>
          {tabs.map(([key, label]) => {
            const selected = value === key;
            return (
              <button
                key={key}
                ref={(el) => {
                  if (el) refs.current.set(key, el);
                  else refs.current.delete(key);
                }}
                id={tabId(key)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={selected ? panelId : undefined}
                tabIndex={selected ? 0 : -1}
                onClick={() => onChange(key)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition sm:px-5 ${
                  selected ? 'bg-ink-900 text-paper' : 'text-ink-600 hover:text-ink-900'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId(value)} tabIndex={0} className={`${panelClassName} focus:outline-none`}>
        {children}
      </div>
    </>
  );
}

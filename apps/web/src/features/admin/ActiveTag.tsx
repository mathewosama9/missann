// حالة الحساب (مفعّل / معطّل) — لون + نص (لا لون وحده)
export function ActiveTag({ active }: { active: boolean }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? 'bg-lime-200 text-ink-900' : 'bg-coral-100 text-coral-600'}`}>
      {active ? 'مفعّل' : 'معطّل'}
    </span>
  );
}

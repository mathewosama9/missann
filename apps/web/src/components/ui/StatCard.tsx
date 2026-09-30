import type { LucideIcon } from 'lucide-react';

const tones = {
  lime: 'bg-lime-300 text-ink-900',
  coral: 'bg-coral-300 text-ink-900',
  brand: 'bg-brand-500 text-white',
  ink: 'bg-ink-900 text-lime-300',
} as const;

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'ink',
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: keyof typeof tones;
}) {
  return (
    <div className="card flex items-start justify-between p-5">
      <div>
        <div className="text-sm text-ink-500">{label}</div>
        <div className="mt-3 font-display text-3xl font-extrabold text-ink-900">{value}</div>
      </div>
      <span className={`grid h-11 w-11 place-items-center rounded-full ${tones[tone]}`}>
        <Icon size={19} />
      </span>
    </div>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

import { Star } from 'lucide-react';
export function Stars({ count, size = 22, max = 3 }: { count: number; size?: number; max?: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${count} من ${max} نجوم`} role="img">
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          size={size}
          strokeWidth={2}
          className={i < count ? 'fill-science-yellow text-science-yellow' : 'text-ink-200'}
        />
      ))}
    </span>
  );
}

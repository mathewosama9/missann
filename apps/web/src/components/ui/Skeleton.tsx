// هيكل تحميل (نفس أسلوب بطاقات الكورسات): كتل باهتة نابضة بمقاس المحتوى المنتظر
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-paper-100 ${className}`} aria-hidden="true" />;
}

// صفوف قائمة/جدول قيد التحميل
export function SkeletonRows({ rows = 5, className = 'h-14' }: { rows?: number; className?: string }) {
  return (
    <div className="space-y-2" role="status" aria-label="جارٍ التحميل">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={className} />
      ))}
    </div>
  );
}

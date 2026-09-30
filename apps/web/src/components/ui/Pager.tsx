import { useEffect } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';

// الصفحة الحالية تجاوزت آخر صفحة (حُذف/تغيّر آخر عنصر ثم رجع للقائمة) ← انتقل لآخر صفحة موجودة
// بدل "لا نتائج" بلا ترقيم يُخرج منها
export function useClampPage(page: number, totalPages: number | undefined, setPage: (p: number) => void): void {
  useEffect(() => {
    if (totalPages && page > totalPages) setPage(totalPages);
  }, [page, totalPages, setPage]);
}

// ترقيم صفحات بسيط للجداول
export function Pager({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-ink-500">
      <span>{total} نتيجة</span>
      <div className="flex items-center gap-2">
        <button type="button" className="btn-icon h-9 w-9" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="السابق">
          <ChevronRight size={18} />
        </button>
        <span className="tabular-nums">
          {page} / {totalPages}
        </span>
        <button type="button" className="btn-icon h-9 w-9" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="التالي">
          <ChevronLeft size={18} />
        </button>
      </div>
    </div>
  );
}

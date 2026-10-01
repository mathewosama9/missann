import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, SearchX, FlaskConical, AlertTriangle } from 'lucide-react';
import { coursesApi, type CourseQuery } from '../features/courses/api';
import { CourseCard, CourseCardSkeleton } from '../features/courses/CourseCard';
import { CourseFilters, type FiltersState } from '../features/courses/CourseFilters';

export function Courses() {
  const [params, setParams] = useSearchParams();

  const filters: FiltersState = {
    grade: params.get('grade') ?? '',
    type: params.get('type') ?? '',
    term: params.get('term') ?? '',
    q: params.get('q') ?? '',
  };
  const page = Math.max(1, Number(params.get('page')) || 1);

  // تحديث الفلاتر يعيد الصفحة للأولى
  const applyFilters = (next: FiltersState) => {
    const p = new URLSearchParams();
    if (next.grade) p.set('grade', next.grade);
    if (next.type) p.set('type', next.type);
    if (next.term) p.set('term', next.term);
    if (next.q) p.set('q', next.q);
    setParams(p, { replace: true });
  };

  const goToPage = (n: number) => {
    const p = new URLSearchParams(params);
    p.set('page', String(n));
    setParams(p);
  };

  const query: CourseQuery = useMemo(
    () => ({
      grade: filters.grade || undefined,
      type: filters.type || undefined,
      term: filters.term || undefined,
      q: filters.q || undefined,
      page,
      pageSize: 12,
    }),
    [filters.grade, filters.type, filters.term, filters.q, page],
  );

  const { data, isPending, isError } = useQuery({
    queryKey: ['courses', query],
    queryFn: () => coursesApi.list(query),
    placeholderData: keepPreviousData,
    // الكتالوج عام ونادر التغيّر (والخادم يخزّنه مؤقتاً): التنقل بين الفلاتر والرجوع للصفحة بلا طلبات جديدة
    staleTime: 5 * 60_000,
  });

  return (
    <div className="container-app pt-10">
      <header className="relative mb-10 overflow-hidden rounded-4xl bg-ink-900 px-6 py-12 text-paper sm:px-10">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-paper/20 px-3 py-1 text-xs text-paper/70">
              <FlaskConical size={14} /> مكتبة الكورسات
            </span>
            <h1 className="mt-4 font-display text-4xl font-extrabold md:text-5xl">
              كورسات <span className="text-lime-300">العلوم</span>
            </h1>
            <p className="mt-3 max-w-md text-paper/60">اختر صفّك ونوع الكورس وابدأ رحلتك مع مس آن بهاء</p>
          </div>
          {data && (
            <div className="text-paper/60">
              <span className="font-display text-4xl font-extrabold text-paper">{data.total}</span> كورس متاح
            </div>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[290px_1fr]">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <CourseFilters value={filters} onChange={applyFilters} />
        </aside>

        <section>
          {isError ? (
            <div className="card grid place-items-center gap-3 p-14 text-center text-ink-500">
              <AlertTriangle size={40} className="text-coral-500" />
              تعذّر تحميل الكورسات، حاول تحديث الصفحة.
            </div>
          ) : isPending ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <CourseCardSkeleton key={i} />
              ))}
            </div>
          ) : data.items.length === 0 ? (
            <div className="card grid place-items-center gap-3 p-14 text-center text-ink-500">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-paper-100 text-ink-400">
                <SearchX size={28} />
              </span>
              <p className="font-semibold text-ink-900">لا توجد كورسات مطابقة لاختيارك حالياً.</p>
              <button type="button" onClick={() => applyFilters({ grade: '', type: '', term: '', q: '' })} className="btn-ghost">
                مسح الفلاتر
              </button>
            </div>
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {data.items.map((course) => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </div>

              {data.totalPages > 1 && (
                <Pagination page={data.page} totalPages={data.totalPages} onGo={goToPage} />
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onGo,
}: {
  page: number;
  totalPages: number;
  onGo: (n: number) => void;
}) {
  return (
    <div className="mt-8 flex items-center justify-center gap-2">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onGo(page - 1)}
        className="btn-icon disabled:opacity-40"
        aria-label="السابق"
      >
        <ChevronRight size={18} />
      </button>
      <span className="px-3 text-sm font-medium text-ink-600">
        صفحة {page} من {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onGo(page + 1)}
        className="btn-icon disabled:opacity-40"
        aria-label="التالي"
      >
        <ChevronLeft size={18} />
      </button>
    </div>
  );
}

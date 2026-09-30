import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, Users, ChevronLeft } from 'lucide-react';
import { GRADE_SHORT, formatEGP, type Grade } from '@miss-ann/shared';
import { PageTitle } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pager, useClampPage } from '../../components/ui/Pager';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { apiErrorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { adminApi, adminKeys, type StudentsQuery } from '../../features/admin/api';
import { ActiveTag } from '../../features/admin/ActiveTag';

// البحث يُرسل بعد توقف الكتابة (لا طلب مع كل حرف)، والحد الأدنى حرفان كما في الخادم
const SEARCH_DEBOUNCE_MS = 350;

export function AdminStudents() {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [grade, setGrade] = useState<Grade | ''>('');
  const [status, setStatus] = useState<'' | 'active' | 'inactive'>('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      const v = text.trim();
      setQ(v.length >= 2 ? v : '');
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);

  const query: StudentsQuery = { page, ...(q && { q }), ...(grade && { grade }), ...(status && { status }) };
  const listQ = useQuery({ queryKey: adminKeys.students(query), queryFn: () => adminApi.students(query), placeholderData: keepPreviousData });
  const data = listQ.data;
  useClampPage(page, data?.totalPages, setPage);
  const filtered = Boolean(q || grade || status);

  return (
    <div className="space-y-6">
      <PageTitle title="الطلاب" subtitle="بحث وفلترة، تفعيل وتعطيل، الأجهزة وكلمات المرور." />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <label className="relative sm:w-72">
          <span className="sr-only">بحث بالاسم أو الموبايل</span>
          <Search size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-400" />
          <input className="input py-2 pr-10" placeholder="بحث بالاسم أو الموبايل" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <select
            className="input w-full py-2 sm:w-auto"
            value={grade}
            onChange={(e) => {
              setGrade(e.target.value as Grade | '');
              setPage(1);
            }}
            aria-label="الصف"
          >
            <option value="">كل الصفوف</option>
            {(Object.keys(GRADE_SHORT) as Grade[]).map((g) => (
              <option key={g} value={g}>
                {GRADE_SHORT[g]}
              </option>
            ))}
          </select>
          <select
            className="input w-full py-2 sm:w-auto"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setPage(1);
            }}
            aria-label="الحالة"
          >
            <option value="">كل الحالات</option>
            <option value="active">مفعّل</option>
            <option value="inactive">معطّل / لم يُفعَّل</option>
          </select>
        </div>
      </div>

      {listQ.isPending ? (
        <SkeletonRows rows={6} className="h-16" />
      ) : listQ.isError ? (
        <div className="card p-8 text-center text-coral-600">{apiErrorMessage(listQ.error)}</div>
      ) : !data?.items.length ? (
        <EmptyState
          icon={Users}
          title={filtered ? 'لا نتائج' : 'لا يوجد طلاب بعد'}
          text={filtered ? 'جرّب كلمة بحث أو فلتر مختلف.' : 'الطلاب يظهرون هنا فور تسجيلهم.'}
        />
      ) : (
        <>
          {/* موبايل: بطاقات؛ الشاشات الأكبر: جدول */}
          <ul className={`space-y-2 md:hidden ${listQ.isFetching ? 'opacity-60' : ''}`}>
            {data.items.map((s) => (
              <li key={s.id}>
                <Link to={`/admin/students/${s.id}`} className="card flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-ink-900">{s.name}</div>
                    <div className="text-xs text-ink-400" dir="ltr">
                      {s.phone}
                    </div>
                    <div className="mt-1 text-xs text-ink-500">
                      {s.grade ? GRADE_SHORT[s.grade] : '—'} · {s.activeEnrollments} اشتراك نشط
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ActiveTag active={s.isActive} />
                    <ChevronLeft size={16} className="text-ink-300" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <div className={`card hidden overflow-x-auto md:block ${listQ.isFetching ? 'opacity-60' : ''}`}>
            <table className="w-full text-right">
              <thead className="bg-paper-50">
                <tr className="border-b border-ink-900/[0.06] text-xs text-ink-400">
                  <th className="p-4 font-semibold">الطالب</th>
                  <th className="p-4 font-semibold">الصف</th>
                  <th className="p-4 font-semibold">المحافظة</th>
                  <th className="p-4 font-semibold">اشتراكات نشطة</th>
                  <th className="p-4 font-semibold">الرصيد</th>
                  <th className="p-4 font-semibold">الحالة</th>
                  <th className="p-4 font-semibold">التسجيل</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id} className="border-b border-ink-900/[0.06] last:border-0 hover:bg-paper-50">
                    <td className="p-4 text-sm">
                      <Link to={`/admin/students/${s.id}`} className="font-semibold text-ink-800 hover:text-brand-600">
                        {s.name}
                      </Link>
                      <div className="text-xs text-ink-400" dir="ltr">
                        {s.phone}
                      </div>
                    </td>
                    <td className="p-4 text-sm text-ink-600">{s.grade ? GRADE_SHORT[s.grade] : '—'}</td>
                    <td className="p-4 text-sm text-ink-600">{s.governorate || '—'}</td>
                    <td className="p-4 text-sm tabular-nums text-ink-800">{s.activeEnrollments}</td>
                    <td className="p-4 text-sm font-semibold text-brand-600">{formatEGP(s.balance)}</td>
                    <td className="p-4">
                      <ActiveTag active={s.isActive} />
                    </td>
                    <td className="p-4 text-sm text-ink-500">{formatDate(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} totalPages={data.totalPages} total={data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}

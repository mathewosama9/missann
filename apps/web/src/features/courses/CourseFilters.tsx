import { Search, X, SlidersHorizontal } from 'lucide-react';
import {
  Grade,
  CourseType,
  Term,
  GRADE_SHORT,
  COURSE_TYPE_LABELS,
  TERM_LABELS,
} from '@miss-ann/shared';

export interface FiltersState {
  grade: string;
  type: string;
  term: string;
  q: string;
}

interface Props {
  value: FiltersState;
  onChange: (next: FiltersState) => void;
}

// شرائح فلترة + بحث
export function CourseFilters({ value, onChange }: Props) {
  const set = (patch: Partial<FiltersState>) => onChange({ ...value, ...patch });
  const hasAny = !!(value.grade || value.type || value.term || value.q);

  return (
    <div className="card space-y-6 p-5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-semibold text-ink-900">
          <SlidersHorizontal size={16} /> تصفية
        </span>
        {hasAny && (
          <button
            type="button"
            onClick={() => onChange({ grade: '', type: '', term: '', q: '' })}
            className="flex items-center gap-1 text-xs font-medium text-coral-600 hover:text-coral-700"
          >
            <X size={13} /> مسح الكل
          </button>
        )}
      </div>

      <div className="relative">
        <Search size={17} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-300" />
        <input
          type="search"
          value={value.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="ابحث عن كورس..."
          className="input pr-11"
        />
      </div>

      <FilterRow label="الصف">
        <Chip active={value.grade === ''} onClick={() => set({ grade: '' })}>الكل</Chip>
        {Object.values(Grade).map((g) => (
          <Chip key={g} active={value.grade === g} onClick={() => set({ grade: g })}>
            {GRADE_SHORT[g]}
          </Chip>
        ))}
      </FilterRow>

      <FilterRow label="النوع">
        <Chip active={value.type === ''} onClick={() => set({ type: '' })}>الكل</Chip>
        {Object.values(CourseType).map((t) => (
          <Chip key={t} active={value.type === t} onClick={() => set({ type: t })}>
            {COURSE_TYPE_LABELS[t]}
          </Chip>
        ))}
      </FilterRow>

      <FilterRow label="الترم">
        <Chip active={value.term === ''} onClick={() => set({ term: '' })}>الكل</Chip>
        {Object.values(Term).map((t) => (
          <Chip key={t} active={value.term === t} onClick={() => set({ term: t })}>
            {TERM_LABELS[t]}
          </Chip>
        ))}
      </FilterRow>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 text-xs font-semibold text-ink-400">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
        active
          ? 'border-ink-900 bg-ink-900 text-paper'
          : 'border-ink-900/10 bg-paper-50 text-ink-600 hover:border-ink-900/40 hover:text-ink-900'
      }`}
    >
      {children}
    </button>
  );
}

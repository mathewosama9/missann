import { Link } from 'react-router-dom';
import { Layers, ArrowLeft } from 'lucide-react';
import {
  GRADE_SHORT,
  COURSE_TYPE_LABELS,
  TERM_LABELS,
  formatEGP,
  type CourseListItem,
} from '@miss-ann/shared';
import { GRADE_META } from './gradeMeta';

export function CourseCard({ course }: { course: CourseListItem }) {
  const meta = GRADE_META[course.grade];
  const free = course.price === 0;

  return (
    <Link to={`/course/${course.id}`} className="card card-hover group flex flex-col overflow-hidden">
      {/* الغلاف */}
      <div className={`relative m-2 grid h-44 place-items-center overflow-hidden rounded-[1.4rem] ${meta.soft}`}>
        {course.coverImage ? (
          <img
            src={course.coverImage}
            alt={course.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <>
            <div className="absolute inset-0 bg-grid" />
            <meta.Art className="relative h-24 w-24 transition duration-500 group-hover:-rotate-6 group-hover:scale-110" />
          </>
        )}
        <span
          className={`absolute right-3 top-3 grid h-12 w-12 place-items-center rounded-xl border-2 border-ink-900 ${meta.tile}`}
          title={GRADE_SHORT[course.grade]}
        >
          <span className="absolute right-1 top-0.5 text-[8px] font-semibold opacity-60">{meta.code}</span>
          <span className="font-display text-2xl font-extrabold leading-none">{meta.num}</span>
        </span>
        {free && (
          <span className="absolute left-3 top-3 tag bg-ink-900 text-lime-300">مجاني</span>
        )}
      </div>

      {/* المحتوى */}
      <div className="flex flex-1 flex-col px-5 pb-5 pt-3">
        <div className="mb-2 flex flex-wrap items-center gap-x-2 text-xs text-ink-400">
          <span>{COURSE_TYPE_LABELS[course.type]}</span>
          {course.term && (
            <>
              <span className="h-1 w-1 rounded-full bg-ink-200" />
              <span>{TERM_LABELS[course.term]}</span>
            </>
          )}
        </div>

        <h2 className="line-clamp-2 text-xl font-extrabold leading-snug text-ink-900">{course.title}</h2>

        <div className="mb-5 mt-2 flex items-center gap-1.5 text-sm text-ink-500">
          <Layers size={15} /> {course.lessonsCount} حصة
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-dashed border-ink-900/15 pt-4">
          <span className="font-display text-2xl font-extrabold text-ink-900">
            {free ? 'مجاني' : formatEGP(course.price)}
          </span>
          <span className="grid h-10 w-10 place-items-center rounded-full bg-ink-900 text-paper transition group-hover:-translate-x-1 group-hover:bg-lime-300 group-hover:text-ink-900">
            <ArrowLeft size={17} />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function CourseCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="m-2 h-44 animate-pulse rounded-[1.4rem] bg-paper-100" />
      <div className="space-y-3 px-5 pb-5 pt-3">
        <div className="h-3 w-24 animate-pulse rounded-full bg-paper-100" />
        <div className="h-5 w-3/4 animate-pulse rounded-full bg-paper-100" />
        <div className="flex justify-between pt-5">
          <div className="h-7 w-20 animate-pulse rounded-full bg-paper-100" />
          <div className="h-10 w-10 animate-pulse rounded-full bg-paper-100" />
        </div>
      </div>
    </div>
  );
}

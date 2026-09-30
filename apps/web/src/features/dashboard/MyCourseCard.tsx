import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, RotateCcw } from 'lucide-react';
import { COURSE_TYPE_LABELS, type MyCourseDTO } from '@miss-ann/shared';
import { GRADE_META } from '../courses/gradeMeta';
import { formatDate } from '../../lib/format';

// كورس مشترك فيه: التقدّم (حصص مكتملة ÷ كل الحصص) + "كمّل" لأول حصة غير مكتملة، أو "جدّد" للمنتهي
export function MyCourseCard({ c }: { c: MyCourseDTO }) {
  const meta = GRADE_META[c.grade];
  const done = c.lessonsCount > 0 && c.completedLessons === c.lessonsCount;
  const cta = !c.active
    ? { to: `/course/${c.courseId}`, label: 'جدّد الاشتراك', icon: RotateCcw }
    : c.nextLessonId
      ? { to: `/course/${c.courseId}/lesson/${c.nextLessonId}`, label: c.completedLessons ? 'كمّل من هنا' : 'ابدأ أول حصة', icon: ArrowLeft }
      : { to: `/course/${c.courseId}`, label: done ? 'راجع الحصص' : 'تفاصيل الكورس', icon: ArrowLeft };

  return (
    <article className={`card flex gap-4 p-4 ${c.active ? '' : 'opacity-75'}`}>
      <div className={`relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl ${meta.soft}`}>
        {c.coverImage ? <img src={c.coverImage} alt="" loading="lazy" className="h-full w-full object-cover" /> : <meta.Art className="h-12 w-12" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-extrabold leading-snug text-ink-900">{c.title}</h3>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.active ? 'bg-lime-200 text-ink-900' : 'bg-paper-100 text-ink-500'}`}>
            {c.active ? 'ساري' : 'منتهي'}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-ink-400">
          {COURSE_TYPE_LABELS[c.type]} · {c.active ? 'ينتهي' : 'انتهى'} {formatDate(c.expiresAt)}
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-xs text-ink-500">
            <span className="inline-flex items-center gap-1">
              {done && <CheckCircle2 size={13} className="text-lime-700" />}
              {c.completedLessons} من {c.lessonsCount} حصة
            </span>
            <span className="font-semibold tabular-nums text-ink-800">{c.percent}٪</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-paper-100" role="progressbar" aria-valuenow={c.percent} aria-valuemin={0} aria-valuemax={100} aria-label="نسبة الإكمال">
            <div className="h-2 rounded-full bg-lime-400" style={{ width: `${c.percent}%` }} />
          </div>
        </div>
        <Link to={cta.to} className="mt-3 inline-flex items-center gap-1 self-start text-sm font-semibold text-brand-600 hover:text-brand-700">
          {cta.label} <cta.icon size={15} />
        </Link>
      </div>
    </article>
  );
}

import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from '../components/ui/notify';
import {
  Lock,
  Play,
  PlayCircle,
  BookOpen,
  Clock,
  ArrowRight,
  ChevronLeft,
  CheckCircle2,
  ShoppingCart,
  Paperclip,
  Layers,
  FileText,
  ClipboardCheck,
  Eye,
  RefreshCw,
} from 'lucide-react';
import {
  GRADE_LABELS,
  COURSE_TYPE_LABELS,
  TERM_LABELS,
  formatEGP,
  type LessonListItem,
} from '@miss-ann/shared';
import { coursesApi } from '../features/courses/api';
import { GRADE_META } from '../features/courses/gradeMeta';
import { useAuth } from '../store/auth';
import { Spinner } from '../components/ui/Spinner';
import { SubscribeModal } from '../features/wallet/SubscribeModal';
import { formatDate } from '../lib/format';

function formatDuration(sec: number): string {
  if (!sec) return '—';
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} س ${m % 60} د` : `${m} دقيقة`;
}

export function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [subscribing, setSubscribing] = useState(false);

  const { data: course, isPending, isError } = useQuery({
    queryKey: ['course', id],
    queryFn: () => coursesApi.detail(id!),
    enabled: !!id,
  });

  if (isPending) {
    return (
      <div className="container-app grid place-items-center py-32">
        <Spinner className="h-8 w-8 text-brand-500" />
      </div>
    );
  }

  if (isError || !course) {
    return (
      <div className="container-app py-24 text-center">
        <p className="font-display text-2xl font-extrabold text-ink-900">الكورس غير موجود أو غير متاح.</p>
        <Link to="/courses" className="btn-dark mt-6">
          <ArrowRight size={18} /> رجوع للكورسات
        </Link>
      </div>
    );
  }

  const free = course.price === 0;
  const meta = GRADE_META[course.grade];
  const totalSec = course.lessons.reduce((s, l) => s + (l.durationSec || 0), 0);
  const firstLesson = course.lessons.find((l) => !l.locked);

  const handleSubscribe = () => {
    if (!user) {
      toast.info('سجّل الدخول أولاً للاشتراك');
      navigate('/login', { state: { from: `/course/${course.id}` } });
      return;
    }
    if (user.role !== 'STUDENT') {
      toast.info('الاشتراك متاح لحسابات الطلاب فقط');
      return;
    }
    setSubscribing(true);
  };

  return (
    <div>
      {/* رأس الصفحة */}
      <section className="container-app pt-8">
        <nav className="mb-6 flex items-center gap-1.5 text-sm text-ink-400">
          <Link to="/courses" className="hover:text-ink-900">الكورسات</Link>
          <ChevronLeft size={14} />
          <Link to={`/courses?grade=${course.grade}`} className="hover:text-ink-900">
            {GRADE_LABELS[course.grade]}
          </Link>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              <span className={`tag ${meta.tile}`}>{GRADE_LABELS[course.grade]}</span>
              <span className="tag border border-ink-900/15 bg-white text-ink-700">{COURSE_TYPE_LABELS[course.type]}</span>
              {course.term && (
                <span className="tag border border-ink-900/15 bg-white text-ink-700">{TERM_LABELS[course.term]}</span>
              )}
            </div>

            <h1 className="font-display text-4xl font-extrabold leading-[1.2] text-ink-900 md:text-5xl">
              {course.title}
            </h1>
            <p className="mt-5 max-w-2xl whitespace-pre-line text-lg leading-8 text-ink-500">{course.description}</p>

            <dl className="mt-8 grid max-w-xl grid-cols-3 divide-x divide-x-reverse divide-ink-900/10 rounded-3xl border border-ink-900/10 bg-white">
              <Stat icon={Layers} label="الحصص" value={`${course.lessonsCount}`} />
              <Stat icon={Clock} label="المدة" value={formatDuration(totalSec)} />
              <Stat icon={Paperclip} label="مرفقات" value={`${course.lessons.reduce((s, l) => s + l.attachmentsCount, 0)}`} />
            </dl>

            {course.enrolled && (
              <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-lime-200 px-4 py-2 text-sm font-semibold text-ink-900">
                <CheckCircle2 size={18} /> أنت مشترك في هذا الكورس
                {course.enrollmentExpiresAt && (
                  <span className="font-normal text-ink-600">— حتى {formatDate(course.enrollmentExpiresAt)}</span>
                )}
              </div>
            )}
          </div>

          {/* بطاقة الاشتراك */}
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="overflow-hidden rounded-4xl border-2 border-ink-900 bg-white shadow-stamp">
              <div className={`relative grid h-48 place-items-center ${meta.soft} bg-grid`}>
                {course.coverImage ? (
                  <img src={course.coverImage} alt={course.title} className="h-full w-full object-cover" />
                ) : (
                  <meta.Art className="h-28 w-28" />
                )}
              </div>
              <div className="space-y-5 p-6">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-xs text-ink-400">سعر الكورس</div>
                    <div className="font-display text-4xl font-extrabold text-ink-900">
                      {free ? 'مجاني' : formatEGP(course.price)}
                    </div>
                  </div>
                  {course.type === 'MONTHLY' && !free && (
                    <span className="mb-2 text-sm text-ink-400">شهرياً</span>
                  )}
                </div>

                {course.enrolled ? (
                  <button
                    type="button"
                    className="btn-primary w-full py-3.5"
                    onClick={() =>
                      firstLesson
                        ? navigate(`/course/${course.id}/lesson/${firstLesson.id}`)
                        : toast.info('لم تُضف حصص لهذا الكورس بعد')
                    }
                  >
                    <PlayCircle size={18} /> ابدأ المشاهدة
                  </button>
                ) : null}
                {course.enrolled && course.type === 'MONTHLY' && (
                  <button type="button" className="btn-ghost w-full" onClick={handleSubscribe}>
                    <RefreshCw size={16} /> جدّد الاشتراك لشهر آخر
                  </button>
                )}
                {!course.enrolled && (
                  <button type="button" className="btn-accent w-full py-3.5" onClick={handleSubscribe}>
                    <ShoppingCart size={18} /> {free ? 'اشترك مجاناً' : 'اشترك الآن'}
                  </button>
                )}

                <ul className="space-y-2.5 border-t border-dashed border-ink-900/15 pt-5 text-sm text-ink-600">
                  <li className="flex items-center gap-2.5"><PlayCircle size={16} className="text-brand-500" /> وصول كامل لكل الحصص</li>
                  <li className="flex items-center gap-2.5"><FileText size={16} className="text-brand-500" /> مذكرات ومرفقات PDF</li>
                  <li className="flex items-center gap-2.5"><ClipboardCheck size={16} className="text-brand-500" /> امتحانات وواجبات بتصحيح فوري</li>
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <SubscribeModal course={course} open={subscribing} onClose={() => setSubscribing(false)} />

      {/* قائمة الحصص */}
      <section className="container-app mt-16">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <span className="eyebrow"><BookOpen size={14} /> المنهج</span>
            <h2 className="section-title mt-3">محتوى الكورس</h2>
          </div>
          <span className="text-sm text-ink-400">{course.lessons.length} حصة</span>
        </div>
        {course.lessons.length === 0 ? (
          <div className="card p-12 text-center text-ink-400">لم تُضف حصص بعد.</div>
        ) : (
          <ol className="card divide-y divide-ink-900/[0.06] overflow-hidden">
            {course.lessons.map((lesson, idx) => (
              <LessonRow key={lesson.id} courseId={course.id} lesson={lesson} index={idx + 1} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="px-4 py-4">
      <dt className="flex items-center gap-1.5 text-xs text-ink-400"><Icon size={14} /> {label}</dt>
      <dd className="mt-1 font-display text-xl font-extrabold text-ink-900">{value}</dd>
    </div>
  );
}

function LessonRow({
  courseId,
  lesson,
  index,
}: {
  courseId: number;
  lesson: LessonListItem;
  index: number;
}) {
  const rowClass = 'flex items-center gap-4 p-4 sm:p-5';
  const content = (
    <>
      <span className="w-8 shrink-0 text-center font-display text-lg font-extrabold text-ink-300">
        {String(index).padStart(2, '0')}
      </span>

      <div
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${
          lesson.locked ? 'bg-ink-50 text-ink-300' : 'bg-ink-900 text-lime-300'
        }`}
      >
        {lesson.locked ? <Lock size={17} /> : <Play size={17} fill="currentColor" />}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-sans font-semibold text-ink-900">{lesson.title}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-400">
          <span className="inline-flex items-center gap-1">
            <Clock size={13} /> {formatDuration(lesson.durationSec)}
          </span>
          {lesson.attachmentsCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Paperclip size={13} /> {lesson.attachmentsCount} مرفق
            </span>
          )}
        </div>
      </div>

      {lesson.isFreePreview ? (
        <span className="tag shrink-0 bg-lime-200 text-ink-900">
          <Eye size={13} /> معاينة مجانية
        </span>
      ) : lesson.locked ? (
        <span className="tag shrink-0 bg-ink-50 text-ink-500">
          <Lock size={12} /> مقفول
        </span>
      ) : (
        <span className="tag shrink-0 bg-brand-50 text-brand-700">
          <CheckCircle2 size={13} /> متاح
        </span>
      )}
    </>
  );

  // الحصص المتاحة (اشتراك أو معاينة مجانية) تفتح المشغّل؛ المقفولة تبقى للعرض فقط
  return (
    <li>
      {lesson.locked ? (
        <div className={rowClass}>{content}</div>
      ) : (
        <Link
          to={`/course/${courseId}/lesson/${lesson.id}`}
          className={`${rowClass} transition hover:bg-paper-50`}
        >
          {content}
        </Link>
      )}
    </li>
  );
}

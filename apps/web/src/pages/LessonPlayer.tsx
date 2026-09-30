import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from '../components/ui/notify';
import {
  ArrowRight,
  ChevronLeft,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Lock,
  Play,
  Star,
  VideoOff,
  ShoppingCart,
} from 'lucide-react';
import {
  LESSON_COMPLETE_MIN_PERCENT,
  type AttachmentDTO,
  type CourseDetailDTO,
  type LessonPlayDTO,
} from '@miss-ann/shared';
import { coursesApi } from '../features/courses/api';
import { lessonsApi } from '../features/lessons/api';
import { VideoPlayer } from '../features/lessons/VideoPlayer';
import { useLessonProgress } from '../features/lessons/useLessonProgress';
import { useCaptureGuard } from '../features/lessons/useCaptureGuard';
import { apiErrorMessage } from '../lib/api';
import { Spinner } from '../components/ui/Spinner';

const statusOf = (err: unknown) => (axios.isAxiosError(err) ? err.response?.status : undefined);

// لا نعيد المحاولة على أخطاء الصلاحية/عدم الوجود
const retry4xx = (count: number, err: unknown) => {
  const s = statusOf(err);
  return !(s && s >= 400 && s < 500) && count < 1;
};

function formatDuration(sec: number): string {
  if (!sec) return '—';
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} س ${m % 60} د` : `${m} دقيقة`;
}

export function LessonPlayer() {
  const { id, lessonId } = useParams();
  const courseId = Number(id);
  const lid = Number(lessonId);

  const courseQ = useQuery({
    queryKey: ['course', id],
    queryFn: () => coursesApi.detail(courseId),
    enabled: Number.isFinite(courseId),
  });

  const accessQ = useQuery({
    queryKey: ['lesson-access', courseId, lid],
    queryFn: () => lessonsApi.access(courseId, lid),
    enabled: Number.isFinite(courseId) && Number.isFinite(lid),
    retry: retry4xx,
  });

  // الرابط الموقّع شخصي وقصير العمر: لا كاش ولا إعادة جلب تلقائية (تعيد تحميل الفيديو)
  const playQ = useQuery({
    queryKey: ['lesson-play', lid],
    queryFn: () => lessonsApi.play(lid),
    enabled: accessQ.isSuccess && accessQ.data.hasVideo,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnReconnect: false,
    retry: retry4xx,
  });

  if (accessQ.isPending || courseQ.isPending) {
    return (
      <div className="container-app grid place-items-center py-32">
        <Spinner className="h-8 w-8 text-brand-500" />
      </div>
    );
  }

  if (accessQ.isError) {
    const forbidden = statusOf(accessQ.error) === 403;
    return (
      <div className="container-app py-20">
        <div className="card mx-auto max-w-lg p-10 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-ink-50 text-ink-400">
            <Lock size={24} />
          </div>
          <h1 className="font-display text-2xl font-extrabold text-ink-900">
            {forbidden ? 'هذه الحصة للمشتركين فقط' : 'الحصة غير موجودة أو غير متاحة'}
          </h1>
          <p className="mt-2 text-ink-500">{apiErrorMessage(accessQ.error)}</p>
          <Link to={`/course/${courseId}`} className={`${forbidden ? 'btn-accent' : 'btn-dark'} mt-6`}>
            {forbidden ? <ShoppingCart size={18} /> : <ArrowRight size={18} />}
            {forbidden ? 'اشترك في الكورس' : 'رجوع للكورس'}
          </Link>
        </div>
      </div>
    );
  }

  const lesson = accessQ.data;
  const course = courseQ.data;

  return (
    <div className="container-app pb-16 pt-8">
      {/* طباعة صفحة الحصة تخرج فارغة */}
      <style media="print">{'body { display: none !important; }'}</style>
      <nav className="mb-5 flex flex-wrap items-center gap-1.5 text-sm text-ink-400">
        <Link to="/courses" className="hover:text-ink-900">الكورسات</Link>
        <ChevronLeft size={14} />
        <Link to={`/course/${courseId}`} className="hover:text-ink-900">
          {course?.title ?? 'الكورس'}
        </Link>
        <ChevronLeft size={14} />
        <span className="text-ink-700">{lesson.title}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {!lesson.hasVideo ? (
            <PlayerMessage icon={VideoOff} text="لم يُرفع فيديو هذه الحصة بعد، تابعنا قريباً." />
          ) : playQ.isPending ? (
            <div className="grid aspect-video place-items-center rounded-3xl bg-ink-900">
              <Spinner className="h-8 w-8 text-lime-300" />
            </div>
          ) : playQ.isError ? (
            <PlayerMessage icon={VideoOff} text={apiErrorMessage(playQ.error, 'تعذّر تشغيل الفيديو')} />
          ) : (
            <PlayerWithProgress
              key={lid}
              play={playQ.data}
              durationSec={lesson.durationSec}
              onExpired={() => void playQ.refetch()}
            />
          )}

          <div>
            <h1 className="font-display text-3xl font-extrabold leading-tight text-ink-900">{lesson.title}</h1>
            <div className="mt-2 flex items-center gap-1.5 text-sm text-ink-400">
              <Clock size={14} /> {formatDuration(lesson.durationSec)}
            </div>
          </div>

          <Attachments items={lesson.attachments} />
        </div>

        {course && <LessonsSidebar course={course} currentId={lid} />}
      </div>
    </div>
  );
}

// ── المشغّل + شريط التقدّم + زر الإكمال ─────────────────────────
function PlayerWithProgress({
  play,
  durationSec,
  onExpired,
}: {
  play: LessonPlayDTO;
  durationSec: number;
  onExpired: () => void;
}) {
  const { percent, completedAt, onTimeUpdate, flush, complete } = useLessonProgress(
    play.lessonId,
    play.progress,
    durationSec,
  );
  const { reason: guard } = useCaptureGuard();
  const [completing, setCompleting] = useState(false);

  // حفظ التقدّم فوراً عند الحجب (ترك الصفحة غالباً يسبق إغلاقها)
  useEffect(() => {
    if (guard) void flush();
  }, [guard, flush]);
  const [stars, setStars] = useState<number | null>(null);

  const canComplete = percent >= LESSON_COMPLETE_MIN_PERCENT;

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const res = await complete();
      setStars(res.stars);
      if (res.justCompleted) toast.success(`أحسنت! حصلت على نجمة جديدة — معك ${res.stars} نجمة`);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <VideoPlayer
        play={play}
        guard={guard}
        onExpired={onExpired}
        startAt={play.progress.completedAt ? 0 : play.progress.lastPositionSec}
        onTimeUpdate={onTimeUpdate}
        onPause={() => void flush()}
        onEnded={() => void flush()}
      />

      <div className="card flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <div className="min-w-[180px] flex-1">
          <div className="mb-1.5 flex justify-between text-xs font-semibold text-ink-500">
            <span>تقدّمك في الحصة</span>
            <span>{percent}٪</span>
          </div>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-ink-50"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-lime-400 transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {completedAt ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-lime-200 px-4 py-2 text-sm font-semibold text-ink-900">
            <Star size={16} className="fill-science-yellow text-science-yellow" />
            تم إكمال الحصة{stars !== null && ` — ${stars} نجمة`}
          </span>
        ) : (
          <button
            type="button"
            className="btn-accent"
            onClick={handleComplete}
            disabled={!canComplete || completing}
            title={canComplete ? undefined : `شاهد ${LESSON_COMPLETE_MIN_PERCENT}٪ من الحصة أولاً`}
          >
            {completing ? <Spinner /> : <CheckCircle2 size={18} />} تم إكمال الحصة
          </button>
        )}
      </div>
    </div>
  );
}

function PlayerMessage({ icon: Icon, text }: { icon: typeof VideoOff; text: string }) {
  return (
    <div className="grid aspect-video place-items-center rounded-3xl bg-ink-900 p-6 text-center text-paper">
      <div>
        <Icon size={36} className="mx-auto mb-3 text-lime-300" />
        <p className="font-semibold">{text}</p>
      </div>
    </div>
  );
}

function Attachments({ items }: { items: AttachmentDTO[] }) {
  if (items.length === 0) return null;
  return (
    <section className="card p-5">
      <h2 className="mb-3 font-display text-xl font-extrabold text-ink-900">مرفقات الحصة</h2>
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id}>
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl border border-ink-900/10 p-3 transition hover:border-ink-900/30 hover:bg-paper-50"
            >
              <FileText size={18} className="shrink-0 text-brand-500" />
              <span className="flex-1 truncate font-semibold text-ink-800">{a.title}</span>
              <Download size={16} className="text-ink-400" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LessonsSidebar({ course, currentId }: { course: CourseDetailDTO; currentId: number }) {
  return (
    <aside className="lg:sticky lg:top-28 lg:self-start">
      <div className="card overflow-hidden">
        <div className="border-b border-ink-900/[0.06] p-4">
          <div className="text-xs text-ink-400">حصص الكورس</div>
          <div className="truncate font-display text-lg font-extrabold text-ink-900">{course.title}</div>
        </div>
        <ol className="max-h-[60vh] divide-y divide-ink-900/[0.06] overflow-y-auto">
          {course.lessons.map((l, idx) => {
            const current = l.id === currentId;
            const inner = (
              <>
                <span className="w-6 shrink-0 text-center font-display font-extrabold text-ink-300">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                    l.locked ? 'bg-ink-50 text-ink-300' : 'bg-ink-900 text-lime-300'
                  }`}
                >
                  {l.locked ? <Lock size={13} /> : <Play size={13} fill="currentColor" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{l.title}</span>
              </>
            );
            const cls = `flex items-center gap-3 p-3 ${current ? 'bg-lime-100 text-ink-900' : 'text-ink-700'}`;
            return (
              <li key={l.id}>
                {l.locked ? (
                  <div className={`${cls} opacity-60`}>{inner}</div>
                ) : (
                  <Link
                    to={`/course/${course.id}/lesson/${l.id}`}
                    className={`${cls} transition hover:bg-paper-50`}
                    aria-current={current ? 'page' : undefined}
                  >
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}

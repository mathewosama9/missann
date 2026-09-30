import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardList,
  Timer,
  ListChecks,
  CalendarClock,
  PlayCircle,
  RotateCcw,
  Trophy,
  Lock,
  CircleSlash,
  AlertTriangle,
} from 'lucide-react';
import { GRADE_SHORT, examStars, scorePercent, type ExamListItemDTO } from '@miss-ann/shared';
import { PageTitle } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { Stars } from '../../features/exams/Stars';
import { examsApi } from '../../features/exams/api';
import { apiErrorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

type Tab = 'available' | 'finished';

export function ExamsPage() {
  const [tab, setTab] = useState<Tab>('available');
  const [starting, setStarting] = useState<ExamListItemDTO | null>(null);
  const listQ = useQuery({ queryKey: ['exams'], queryFn: examsApi.list, staleTime: 0 });

  const items = listQ.data ?? [];
  const available = items.filter((e) => e.state === 'OPEN' || e.state === 'IN_PROGRESS' || e.state === 'UPCOMING');
  const finished = items.filter((e) => e.state === 'FINISHED' || e.state === 'MISSED');
  const shown = tab === 'available' ? available : finished;

  return (
    <div className="space-y-6">
      <PageTitle title="الامتحانات" subtitle="امتحن نفسك، واجمع النجوم مع كل امتحان تنجح فيه." />

      <div className="inline-flex rounded-full border border-ink-900/10 bg-white p-1" role="tablist">
        {(
          [
            ['available', 'المتاحة', available.length],
            ['finished', 'المنتهية', finished.length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              tab === key ? 'bg-ink-900 text-paper' : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            {label} <span className="tabular-nums opacity-70">({count})</span>
          </button>
        ))}
      </div>

      {listQ.isPending ? (
        <div className="grid place-items-center py-20">
          <Spinner className="h-8 w-8 text-brand-500" />
        </div>
      ) : listQ.isError ? (
        <EmptyState icon={AlertTriangle} title="تعذّر تحميل الامتحانات" text={apiErrorMessage(listQ.error)} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={tab === 'available' ? 'لا توجد امتحانات متاحة الآن' : 'لم تنهِ أي امتحان بعد'}
          text={tab === 'available' ? 'ستظهر هنا امتحانات صفّك وكورساتك فور نشرها.' : 'بعد تسليم أي امتحان ستجد نتيجتك هنا.'}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((e) => (
            <ExamCard key={e.id} exam={e} onStart={() => setStarting(e)} />
          ))}
        </div>
      )}

      <StartModal exam={starting} onClose={() => setStarting(null)} />
    </div>
  );
}

function ExamCard({ exam, onStart }: { exam: ExamListItemDTO; onStart: () => void }) {
  const a = exam.attempt;
  const percent = a && a.score !== null ? scorePercent(a.score, a.totalPoints) : null;

  return (
    <article className="card flex flex-col p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tag bg-paper-100 text-ink-700">{exam.courseTitle ?? GRADE_SHORT[exam.grade]}</span>
        <StateTag state={exam.state} />
      </div>
      <h3 className="mt-3 font-display text-xl font-extrabold text-ink-900">{exam.title}</h3>
      {exam.description && <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-500">{exam.description}</p>}

      <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-600">
        <Meta icon={Timer}>{exam.durationMin} دقيقة</Meta>
        <Meta icon={ListChecks}>
          {exam.questionsCount} سؤال · {exam.totalPoints} درجة
        </Meta>
        {exam.state === 'UPCOMING' && exam.startAt && <Meta icon={CalendarClock}>يبدأ {formatDateTime(exam.startAt)}</Meta>}
        {exam.state !== 'UPCOMING' && exam.endAt && exam.state !== 'FINISHED' && (
          <Meta icon={CalendarClock}>متاح حتى {formatDateTime(exam.endAt)}</Meta>
        )}
      </dl>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
        {exam.state === 'FINISHED' && a && (
          <>
            {percent !== null ? (
              <div className="flex items-center gap-3">
                <span className="font-display text-2xl font-extrabold text-ink-900 tabular-nums">
                  {a.score}/{a.totalPoints}
                </span>
                <Stars count={examStars(percent, exam.passScore)} size={18} />
              </div>
            ) : (
              <span className="text-sm text-ink-500">
                {a.resultState === 'GRADING'
                  ? 'قيد التصحيح — تظهر درجتك بعد تصحيح مس آن'
                  : exam.resultRelease === 'AFTER_END' && exam.endAt
                    ? `النتيجة بعد ${formatDateTime(exam.endAt)}`
                    : 'تم التسليم — النتيجة تُعلن لاحقاً'}
              </span>
            )}
            <Link to={`/dashboard/exams/result/${a.id}`} className="btn-ghost">
              <Trophy size={17} /> {percent !== null ? 'النتيجة والمراجعة' : 'التفاصيل'}
            </Link>
          </>
        )}
        {exam.state === 'OPEN' && (
          <button type="button" className="btn-primary w-full sm:w-auto" onClick={onStart}>
            <PlayCircle size={18} /> ابدأ الامتحان
          </button>
        )}
        {exam.state === 'IN_PROGRESS' && (
          <Link to={`/exam/${exam.id}`} className="btn-accent w-full sm:w-auto">
            <RotateCcw size={18} /> أكمل الامتحان
          </Link>
        )}
        {exam.state === 'UPCOMING' && (
          <span className="btn-ghost pointer-events-none w-full opacity-70 sm:w-auto">
            <Lock size={17} /> لم يبدأ بعد
          </span>
        )}
        {exam.state === 'MISSED' && (
          <span className="inline-flex items-center gap-1.5 text-sm text-ink-500">
            <CircleSlash size={16} /> انتهت فترة الامتحان قبل أن تبدأه
          </span>
        )}
      </div>
    </article>
  );
}

function Meta({ icon: Icon, children }: { icon: typeof Timer; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <Icon size={16} className="text-ink-400" />
      <span>{children}</span>
    </div>
  );
}

const STATE_TAGS: Record<ExamListItemDTO['state'], [string, string]> = {
  OPEN: ['متاح الآن', 'bg-lime-200 text-ink-900'],
  IN_PROGRESS: ['جارٍ', 'bg-brand-100 text-brand-700'],
  UPCOMING: ['قريباً', 'bg-paper-100 text-ink-600'],
  FINISHED: ['تم', 'bg-ink-900 text-lime-300'],
  MISSED: ['فاتك', 'bg-coral-100 text-coral-700'],
};

function StateTag({ state }: { state: ExamListItemDTO['state'] }) {
  const [label, cls] = STATE_TAGS[state];
  return <span className={`tag ${cls}`}>{label}</span>;
}

// تأكيد قبل البدء: الوقت يبدأ من الخادم ولا يتوقف
function StartModal({ exam, onClose }: { exam: ExamListItemDTO | null; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <Modal open={exam !== null} onClose={onClose} title="جاهز تبدأ؟">
      {exam && (
        <div className="space-y-5">
          <div className="rounded-3xl border border-ink-900/10 bg-paper-50 p-4">
            <div className="font-semibold text-ink-900">{exam.title}</div>
            <div className="mt-1 text-sm text-ink-500">
              {exam.questionsCount} سؤال · {exam.durationMin} دقيقة
            </div>
          </div>
          <ul className="space-y-2 text-sm leading-6 text-ink-600">
            <li className="flex gap-2">
              <Timer size={17} className="mt-0.5 shrink-0 text-brand-500" />
              العدّاد يبدأ فور الضغط على «ابدأ» ولا يتوقف حتى لو أغلقت الصفحة.
            </li>
            <li className="flex gap-2">
              <ListChecks size={17} className="mt-0.5 shrink-0 text-brand-500" />
              إجاباتك تُحفظ تلقائياً مع كل اختيار أو كتابة.
            </li>
            <li className="flex gap-2">
              <AlertTriangle size={17} className="mt-0.5 shrink-0 text-coral-600" />
              عند انتهاء الوقت يُسلَّم الامتحان تلقائياً. لكل امتحان محاولة واحدة فقط.
            </li>
          </ul>
          <div className="flex justify-end gap-3">
            <button type="button" className="btn-ghost" onClick={onClose}>
              ليس الآن
            </button>
            <button type="button" className="btn-primary" onClick={() => navigate(`/exam/${exam.id}`)}>
              <PlayCircle size={18} /> ابدأ
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

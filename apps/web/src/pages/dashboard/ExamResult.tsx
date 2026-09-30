import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, X, CalendarClock, AlertTriangle, Clock, MinusCircle, PenLine, Megaphone, BookOpenCheck, MessageSquare } from 'lucide-react';
import {
  ATTEMPT_STATUS_LABELS,
  QUESTION_TYPE_LABELS,
  isManualQuestion,
  type AttemptResultDTO,
  type ReviewItemDTO,
} from '@miss-ann/shared';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { Stars } from '../../features/exams/Stars';
import { examsApi } from '../../features/exams/api';
import { apiErrorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

const MOTIVATION = [
  'لا بأس! كل عالِم بدأ بخطأ. راجع إجاباتك وحاول مرة أخرى في الامتحان القادم.',
  'أحسنت! نجحت في الامتحان — استمر وستجمع نجوماً أكثر.',
  'رائع جداً! مستواك ممتاز، اقتربت من العلامة الكاملة.',
  'عبقري علوم! أداء مذهل — أنت نجم الفصل.',
];

export function ExamResult() {
  const attemptId = Number(useParams().attemptId);
  const resultQ = useQuery({
    queryKey: ['exam-result', attemptId],
    queryFn: () => examsApi.result(attemptId),
    enabled: Number.isInteger(attemptId) && attemptId > 0,
  });

  if (resultQ.isPending) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="h-8 w-8 text-brand-500" />
      </div>
    );
  }
  if (resultQ.isError) {
    return <EmptyState icon={AlertTriangle} title="تعذّر عرض النتيجة" text={apiErrorMessage(resultQ.error)} />;
  }
  const r = resultQ.data;

  return (
    <div className="space-y-6">
      <Link to="/dashboard/exams" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
        <ArrowRight size={16} /> الامتحانات
      </Link>
      <ScoreCard r={r} />
      {r.resultState === 'VISIBLE' && <Review r={r} />}
    </div>
  );
}

function ScoreCard({ r }: { r: AttemptResultDTO }) {
  const expired = r.status === 'EXPIRED';
  if (r.resultState !== 'VISIBLE' || r.score === null) {
    const [Icon, text] =
      r.resultState === 'GRADING'
        ? [PenLine, 'امتحانك قيد التصحيح: مس آن تصحّح إجاباتك الكتابية، وتظهر درجتك هنا فور انتهائها.']
        : r.resultRelease === 'AFTER_END' && r.resultAvailableAt
          ? [CalendarClock, `تظهر النتيجة والإجابات الصحيحة بعد انتهاء الامتحان للجميع: ${formatDateTime(r.resultAvailableAt)}`]
          : [Megaphone, 'تم تسليم امتحانك بنجاح. ستعلن مس آن النتيجة قريباً.'];
    return (
      <div className="card p-8 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-lime-300 text-ink-900">
          <Icon size={28} />
        </span>
        <h1 className="mt-4 font-display text-2xl font-extrabold text-ink-900">{r.examTitle}</h1>
        <p className="mx-auto mt-2 max-w-md leading-7 text-ink-500">{text}</p>
        {r.submittedAt && <p className="mt-1 text-sm text-ink-400">سلّمت في {formatDateTime(r.submittedAt)}</p>}
      </div>
    );
  }

  const stars = r.stars ?? 0;
  return (
    <div className="relative overflow-hidden rounded-4xl border-2 border-ink-900 bg-ink-900 p-7 text-paper shadow-stamp sm:p-9">
      <div className="absolute -left-12 -top-12 h-44 w-44 rounded-full bg-lime-300/15" aria-hidden />
      <div className="absolute -bottom-14 right-10 h-36 w-36 rounded-full bg-brand-500/25" aria-hidden />
      <div className="relative flex flex-col items-center gap-6 text-center sm:flex-row sm:text-right">
        <div className="grid h-36 w-36 shrink-0 place-items-center rounded-full border-4 border-lime-300 bg-ink-800">
          <div>
            <div className="font-display text-4xl font-extrabold text-lime-300 tabular-nums" dir="ltr">
              {r.score}/{r.totalPoints}
            </div>
            <div className="text-sm text-paper/70 tabular-nums">{r.percent}%</div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-paper/60">{r.examTitle}</div>
          <h1 className="mt-1 font-display text-3xl font-extrabold">{r.passed ? 'ناجح!' : 'حاول مرة أخرى'}</h1>
          <div className="mt-3 flex justify-center sm:justify-start">
            <Stars count={stars} size={30} />
          </div>
          <p className="mt-3 leading-7 text-paper/80">{MOTIVATION[stars]}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs sm:justify-start">
            <span className={`tag ${expired ? 'bg-coral-300 text-ink-900' : 'bg-lime-300 text-ink-900'}`}>
              {expired ? <Clock size={13} /> : <Check size={13} />} {ATTEMPT_STATUS_LABELS[r.status]}
            </span>
            <span className="tag bg-white/10 text-paper">أجبت عن {r.answeredCount} سؤال</span>
            <span className="tag bg-white/10 text-paper">النجاح من {r.passScore}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Review({ r }: { r: AttemptResultDTO }) {
  if (!r.review) return <EmptyState icon={AlertTriangle} title="المراجعة غير متاحة" text="حاول تحديث الصفحة." />;
  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl font-extrabold text-ink-900">مراجعة الإجابات</h2>
      {r.review.map((item, i) => (
        <ReviewCard key={item.questionId} item={item} n={i + 1} />
      ))}
    </section>
  );
}

function ReviewCard({ item, n }: { item: ReviewItemDTO; n: number }) {
  const manual = isManualQuestion(item.type);
  const unanswered = manual ? !item.answerText?.trim() : item.selectedChoiceId === null;
  const partial = manual && !item.correct && item.earned > 0;
  return (
    <article className={`card border-2 p-5 sm:p-6 ${item.correct ? 'border-lime-400' : partial ? 'border-brand-200' : 'border-coral-300'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold text-ink-500">
          السؤال <span className="tabular-nums">{n}</span> · {QUESTION_TYPE_LABELS[item.type]}
        </span>
        {item.correct ? (
          <span className="tag bg-lime-300 text-ink-900">
            <Check size={13} /> <span dir="ltr">+{item.points}</span>
          </span>
        ) : partial ? (
          <span className="tag bg-brand-50 text-brand-700 tabular-nums">
            {item.earned} من {item.points}
          </span>
        ) : unanswered ? (
          <span className="tag bg-paper-100 text-ink-600">
            <MinusCircle size={13} /> بدون إجابة
          </span>
        ) : (
          <span className="tag bg-coral-200 text-ink-900">
            <X size={13} /> 0 من {item.points}
          </span>
        )}
      </div>
      <h3 className="mt-3 whitespace-pre-line font-display text-lg font-bold leading-relaxed text-ink-900">{item.text}</h3>
      {item.imageUrl && (
        <img src={item.imageUrl} alt="" loading="lazy" className="mt-3 max-h-60 max-w-full rounded-2xl border border-ink-900/10 object-contain" />
      )}
      {manual ? (
        <div className="mt-4 space-y-3">
          <div>
            <div className="mb-1 text-xs font-semibold text-ink-500">إجابتك</div>
            {unanswered ? (
              <p className="text-sm text-ink-500">لم تُجب عن هذا السؤال</p>
            ) : (
              <p className="whitespace-pre-line break-words rounded-2xl border border-ink-900/10 bg-paper-50 p-3 leading-7 text-ink-900">
                {item.answerText}
              </p>
            )}
          </div>
          {item.feedback && (
            <p className="flex items-start gap-2 rounded-2xl bg-brand-50 p-3 text-sm leading-6 text-ink-800">
              <MessageSquare size={16} className="mt-1 shrink-0 text-brand-600" />
              <span>
                <b>ملاحظة مس آن:</b> {item.feedback}
              </span>
            </p>
          )}
          {item.modelAnswer && (
            <div className="rounded-2xl bg-lime-100 p-3 text-sm leading-6 text-ink-800">
              <div className="mb-1 inline-flex items-center gap-1.5 font-semibold">
                <BookOpenCheck size={15} /> الإجابة النموذجية
              </div>
              <p className="whitespace-pre-line">{item.modelAnswer}</p>
            </div>
          )}
        </div>
      ) : (
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {item.choices.map((c) => {
          const picked = c.id === item.selectedChoiceId;
          const cls = c.isCorrect
            ? 'border-lime-500 bg-lime-200 text-ink-900'
            : picked
              ? 'border-coral-400 bg-coral-200 text-ink-900'
              : 'border-ink-900/10 bg-white text-ink-600';
          return (
            <li key={c.id} className={`flex items-center gap-2 rounded-2xl border-2 px-4 py-2.5 text-sm font-semibold ${cls}`}>
              {c.isCorrect ? <Check size={17} className="shrink-0" /> : picked ? <X size={17} className="shrink-0" /> : <span className="w-[17px]" />}
              <span className="flex-1">{c.text}</span>
              {picked && <span className="text-xs font-bold opacity-70">إجابتك</span>}
            </li>
          );
        })}
      </ul>
      )}
    </article>
  );
}

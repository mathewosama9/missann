import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '../../components/ui/notify';
import { ArrowRight, Check, X, AlertTriangle, PenLine, BookOpenCheck, CheckCircle2, ChevronLeft, MinusCircle } from 'lucide-react';
import { ATTEMPT_STATUS_LABELS, QUESTION_TYPE_LABELS, type AdminAttemptDetailDTO, type GradingItemDTO } from '@miss-ann/shared';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { adminExamsApi } from '../../features/exams/api';
import { apiErrorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

type Draft = Record<number, { points: string; feedback: string }>;

const draftFrom = (a: AdminAttemptDetailDTO): Draft =>
  Object.fromEntries(
    a.items
      .filter((i) => i.manual)
      .map((i) => [i.questionId, { points: i.awardedPoints === null ? '' : String(i.awardedPoints), feedback: i.feedback ?? '' }]),
  );

const answered = (i: GradingItemDTO) => !!i.answerText?.trim();

// ── تصحيح محاولة: الأسئلة الكتابية تأخذ درجتها من المس، والموضوعية مصحّحة آلياً (للعرض) ─
export function AdminExamGrading() {
  const examId = Number(useParams().id);
  const attemptId = Number(useParams().attemptId);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const key = ['admin', 'attempt', attemptId];
  const attemptQ = useQuery({ queryKey: key, queryFn: () => adminExamsApi.attemptDetail(attemptId) });
  // المحاولة التالية التي تنتظر التصحيح (للتنقل السريع)
  const pendingQ = useQuery({
    queryKey: ['admin', 'exam-attempts', examId, 'pending'],
    queryFn: () => adminExamsApi.attempts(examId, { grading: 'PENDING' }),
  });
  const [draft, setDraft] = useState<Draft>({});

  useEffect(() => {
    if (attemptQ.data) setDraft(draftFrom(attemptQ.data));
  }, [attemptQ.data]);

  const saveM = useMutation({
    mutationFn: (grades: { questionId: number; points: number; feedback: string | null }[]) =>
      adminExamsApi.grade(attemptId, grades),
    onSuccess: (a) => {
      qc.setQueryData(key, a);
      void qc.invalidateQueries({ queryKey: ['admin', 'exam-attempts', examId] });
      void qc.invalidateQueries({ queryKey: ['admin', 'exam-analytics', examId] });
      void qc.invalidateQueries({ queryKey: ['admin', 'exam', examId] });
      void qc.invalidateQueries({ queryKey: ['admin', 'exams'] });
      toast.success(a.pendingCount === 0 ? 'اكتمل تصحيح المحاولة' : 'تم حفظ التصحيح');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  if (attemptQ.isPending) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="h-8 w-8 text-brand-500" />
      </div>
    );
  }
  if (attemptQ.isError) return <EmptyState icon={AlertTriangle} title="تعذّر تحميل المحاولة" text={apiErrorMessage(attemptQ.error)} />;
  const a = attemptQ.data;
  const manualItems = a.items.filter((i) => i.manual && answered(i));
  const next = pendingQ.data?.items.find((x) => x.id !== a.id);

  const save = () => {
    const grades: { questionId: number; points: number; feedback: string | null }[] = [];
    for (const i of manualItems) {
      const d = draft[i.questionId];
      if (!d || d.points.trim() === '') continue;
      const pts = Number(d.points);
      if (!Number.isInteger(pts) || pts < 0 || pts > i.points) {
        toast.error(`درجة السؤال ${i.order} يجب أن تكون من 0 إلى ${i.points}`);
        return;
      }
      grades.push({ questionId: i.questionId, points: pts, feedback: d.feedback.trim() || null });
    }
    if (grades.length === 0) return toast.error('أدخل درجة سؤال واحد على الأقل');
    saveM.mutate(grades);
  };

  return (
    <div className="space-y-6">
      <Link
        to={`/admin/exams/${examId}/analytics`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900"
      >
        <ArrowRight size={16} /> نتائج الامتحان
      </Link>

      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm text-ink-500">{a.examTitle}</div>
            <h1 className="mt-1 font-display text-2xl font-extrabold text-ink-900 sm:text-3xl">{a.user.name}</h1>
            <div className="mt-1 text-sm text-ink-400" dir="ltr">
              {a.user.phone}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="tag bg-paper-100 text-ink-700">{ATTEMPT_STATUS_LABELS[a.status]}</span>
              {a.submittedAt && <span className="tag bg-paper-100 text-ink-600">{formatDateTime(a.submittedAt)}</span>}
              {a.status === 'IN_PROGRESS' ? null : a.pendingCount > 0 ? (
                <span className="tag bg-coral-100 text-coral-700">
                  <PenLine size={13} /> باقي {a.pendingCount} إجابة للتصحيح
                </span>
              ) : (
                <span className="tag bg-lime-200 text-ink-900">
                  <CheckCircle2 size={13} /> مكتمل التصحيح
                </span>
              )}
            </div>
          </div>
          <div className="text-center">
            <div className="font-display text-4xl font-extrabold text-ink-900 tabular-nums" dir="ltr">
              {a.score ?? 0}/{a.totalPoints}
            </div>
            <div className="text-xs text-ink-400">{a.pendingCount > 0 ? 'درجة مبدئية' : 'الدرجة النهائية'}</div>
          </div>
        </div>
      </div>

      {a.status === 'IN_PROGRESS' ? (
        <EmptyState icon={PenLine} title="الطالب ما زال يمتحن" text="يمكنك التصحيح بعد أن يسلّم الامتحان أو ينتهي وقته." />
      ) : (
        <>
          <ol className="space-y-4">
            {a.items.map((i) => (
              <li key={i.questionId}>
                {i.manual ? (
                  <ManualCard
                    item={i}
                    value={draft[i.questionId] ?? { points: '', feedback: '' }}
                    onChange={(v) => setDraft((d) => ({ ...d, [i.questionId]: v }))}
                  />
                ) : (
                  <AutoCard item={i} />
                )}
              </li>
            ))}
          </ol>

          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-ink-900/10 bg-white/95 p-4 shadow-soft backdrop-blur">
            <span className="text-sm text-ink-600">
              {manualItems.length === 0 ? 'لا إجابات كتابية تحتاج تصحيحاً' : `${manualItems.length} إجابة كتابية`}
            </span>
            <div className="flex flex-wrap gap-2">
              {next && (
                <button type="button" className="btn-ghost" onClick={() => navigate(`/admin/exams/${examId}/attempts/${next.id}`)}>
                  التالي: {next.user.name} <ChevronLeft size={17} />
                </button>
              )}
              {manualItems.length > 0 && (
                <button type="button" className="btn-primary" disabled={saveM.isPending} onClick={save}>
                  {saveM.isPending ? <Spinner /> : <Check size={18} />} حفظ التصحيح
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function QuestionHead({ item }: { item: GradingItemDTO }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold text-ink-500">
          السؤال <span className="tabular-nums">{item.order}</span> · {QUESTION_TYPE_LABELS[item.type]}
        </span>
        <span className="tag bg-brand-50 text-brand-700 tabular-nums">
          {item.earned} من {item.points}
        </span>
      </div>
      <h3 className="mt-3 whitespace-pre-line font-display text-lg font-bold leading-relaxed text-ink-900">{item.text}</h3>
      {item.imageUrl && (
        <img src={item.imageUrl} alt="" loading="lazy" className="mt-3 max-h-60 max-w-full rounded-2xl border border-ink-900/10 object-contain" />
      )}
    </>
  );
}

function AutoCard({ item }: { item: GradingItemDTO }) {
  return (
    <article className="card p-5 opacity-90">
      <QuestionHead item={item} />
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
              {picked && <span className="text-xs font-bold opacity-70">إجابة الطالب</span>}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-ink-400">مصحّح آلياً</p>
    </article>
  );
}

function ManualCard({
  item,
  value,
  onChange,
}: {
  item: GradingItemDTO;
  value: { points: string; feedback: string };
  onChange: (v: { points: string; feedback: string }) => void;
}) {
  const has = answered(item);
  const pending = has && item.awardedPoints === null;
  const pointsId = `pts-${item.questionId}`;
  const fbId = `fb-${item.questionId}`;
  return (
    <article className={`card border-2 p-5 ${pending ? 'border-coral-300' : 'border-transparent'}`}>
      <QuestionHead item={item} />

      <div className="mt-4">
        <div className="label">إجابة الطالب</div>
        {has ? (
          <p className="whitespace-pre-line break-words rounded-2xl border border-ink-900/10 bg-paper-50 p-4 leading-7 text-ink-900">
            {item.answerText}
          </p>
        ) : (
          <p className="inline-flex items-center gap-1.5 text-sm text-ink-500">
            <MinusCircle size={15} /> لم يجب — الدرجة صفر تلقائياً
          </p>
        )}
      </div>

      {item.modelAnswer && (
        <div className="mt-3 rounded-2xl bg-lime-100 p-4 text-sm leading-7 text-ink-800">
          <div className="mb-1 inline-flex items-center gap-1.5 font-semibold">
            <BookOpenCheck size={15} /> الإجابة النموذجية
          </div>
          <p className="whitespace-pre-line">{item.modelAnswer}</p>
        </div>
      )}

      {has && (
        <div className="mt-4 grid gap-3 sm:grid-cols-[180px_1fr]">
          <div>
            <label htmlFor={pointsId} className="label">
              الدرجة (من {item.points})
            </label>
            <div className="flex items-center gap-2">
              <input
                id={pointsId}
                type="number"
                inputMode="numeric"
                min={0}
                max={item.points}
                className="input w-24"
                value={value.points}
                onChange={(e) => onChange({ ...value, points: e.target.value })}
              />
              <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={() => onChange({ ...value, points: '0' })}>
                0
              </button>
              <button
                type="button"
                className="btn-ghost px-3 py-2 text-xs"
                onClick={() => onChange({ ...value, points: String(item.points) })}
              >
                كاملة
              </button>
            </div>
          </div>
          <div>
            <label htmlFor={fbId} className="label">
              ملاحظة للطالب (اختياري)
            </label>
            <textarea
              id={fbId}
              className="input min-h-20"
              maxLength={1000}
              value={value.feedback}
              onChange={(e) => onChange({ ...value, feedback: e.target.value })}
            />
          </div>
        </div>
      )}
    </article>
  );
}

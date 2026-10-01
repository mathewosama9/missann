import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from '../components/ui/notify';
import {
  Timer,
  ChevronRight,
  ChevronLeft,
  Send,
  CheckCircle2,
  CloudUpload,
  CloudOff,
  LayoutList,
  SquareStack,
  AlertTriangle,
  ArrowRight,
  Check,
} from 'lucide-react';
import {
  ANSWER_TEXT_MAX,
  EXAM_WARN_SEC,
  QUESTION_TYPE_LABELS,
  isManualQuestion,
  type AttemptSessionDTO,
  type ExamQuestionDTO,
} from '@miss-ann/shared';
import { Logo } from '../components/brand/Logo';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/Spinner';
import { examsApi } from '../features/exams/api';
import { apiErrorMessage } from '../lib/api';

type SaveState = 'saving' | 'saved' | 'error';
type Mode = 'one' | 'all';
type Value = { choiceId: number } | { text: string };

const errorCode = (e: unknown) => (axios.isAxiosError(e) ? (e.response?.data as { code?: string } | undefined)?.code : undefined);
const errorStatus = (e: unknown) => (axios.isAxiosError(e) ? e.response?.status : undefined);
// أخطاء لن تنجح بالإعادة (لا صلاحية/غير موجود/بيانات غير صالحة)
const permanent = (e: unknown) => {
  const s = errorStatus(e);
  return s !== undefined && s >= 400 && s < 500 && s !== 408 && s !== 429;
};

// كتابة الطالب تُحفظ بعد توقف قصير عن الكتابة (وفوراً عند مغادرة الحقل أو التسليم)
const TEXT_SAVE_DELAY_MS = 800;

// ── مشغّل الامتحان: الموعد من الخادم فقط، حفظ تلقائي لكل إجابة، تسليم تلقائي عند الصفر ─
export function ExamRunner() {
  const examId = Number(useParams().examId);
  const sessionQ = useQuery({
    queryKey: ['exam-session', examId],
    queryFn: () => examsApi.start(examId),
    enabled: Number.isInteger(examId) && examId > 0,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (sessionQ.isPending) {
    return (
      <Shell>
        <div className="grid place-items-center py-24">
          <Spinner className="h-10 w-10 text-brand-500" />
        </div>
      </Shell>
    );
  }
  if (sessionQ.isError) {
    const finished = errorCode(sessionQ.error) === 'EXAM_FINISHED';
    return (
      <Shell>
        <div className="card mx-auto max-w-lg p-10 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-coral-200 text-ink-900">
            <AlertTriangle size={28} />
          </span>
          <h1 className="mt-5 font-display text-2xl font-extrabold text-ink-900">
            {finished ? 'انتهى هذا الامتحان' : 'تعذّر فتح الامتحان'}
          </h1>
          <p className="mt-2 leading-7 text-ink-500">
            {finished ? 'لقد سلّمت هذا الامتحان أو انتهى وقته. تجد نتيجتك في قائمة الامتحانات.' : apiErrorMessage(sessionQ.error)}
          </p>
          <Link to="/dashboard/exams" className="btn-primary mt-6">
            <ArrowRight size={18} /> قائمة الامتحانات
          </Link>
        </div>
      </Shell>
    );
  }
  return <Runner session={sessionQ.data} />;
}

function Shell({ children, timer }: { children: React.ReactNode; timer?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 border-b border-ink-900/[0.08] bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-3 px-4">
          <Logo />
          {timer}
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}

function Runner({ session }: { session: AttemptSessionDTO }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const questions = session.questions;

  // فرق ساعة الجهاز عن الخادم ← العدّاد لا يتأثر بتغيير ساعة الجهاز
  const offset = useMemo(() => Date.parse(session.serverNow) - Date.now(), [session.serverNow]);
  const deadline = Date.parse(session.deadlineAt);
  // العدّاد يعيد رسم نفسه فقط؛ المشغّل يتغيّر مرة واحدة عند الصفر
  const [expired, setExpired] = useState(() => deadline - (Date.now() + offset) <= 0);

  const [answers, setAnswers] = useState<Record<number, number>>(session.answers);
  const [texts, setTexts] = useState<Record<number, string>>(session.texts);
  const [saves, setSaves] = useState<Record<number, SaveState>>({});
  const [mode, setMode] = useState<Mode>('one');
  const [index, setIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [submitBlocked, setSubmitBlocked] = useState<string | null>(null);
  const leaving = useRef(false); // بعد التسليم: الانتقال لصفحة النتيجة لا يُحجب

  // ── الحفظ: طلب واحد في الوقت لكل سؤال، والأحدث يفوز ────────────────
  const inflight = useRef(new Map<number, Promise<void>>());
  const latest = useRef(new Map<number, Value>());
  const textTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const persist = useCallback(
    (questionId: number): Promise<void> => {
      const run = async () => {
        const value = latest.current.get(questionId)!;
        setSaves((s) => ({ ...s, [questionId]: 'saving' }));
        try {
          await examsApi.answer(session.attemptId, questionId, value);
          // تغيّرت الإجابة أثناء الطلب ← احفظ الأحدث
          if (latest.current.get(questionId) !== value) return run();
          setSaves((s) => ({ ...s, [questionId]: 'saved' }));
        } catch (e) {
          setSaves((s) => ({ ...s, [questionId]: 'error' }));
          // الوقت انتهى أو سُلِّم من مكان آخر ← لا فائدة من الإعادة
          if (errorStatus(e) === 409) setDone(true);
        }
      };
      const prev = inflight.current.get(questionId) ?? Promise.resolve();
      const next = prev.then(run, run).finally(() => {
        if (inflight.current.get(questionId) === next) inflight.current.delete(questionId);
      });
      inflight.current.set(questionId, next);
      return next;
    },
    [session.attemptId],
  );

  const locked = done || expired;

  const choose = useCallback(
    (q: ExamQuestionDTO, choiceId: number) => {
      if (locked) return;
      setAnswers((a) => ({ ...a, [q.id]: choiceId }));
      latest.current.set(q.id, { choiceId });
      void persist(q.id);
    },
    [locked, persist],
  );

  const flushText = useCallback(
    (questionId: number) => {
      const t = textTimers.current.get(questionId);
      if (t === undefined) return;
      clearTimeout(t);
      textTimers.current.delete(questionId);
      void persist(questionId);
    },
    [persist],
  );

  const write = useCallback(
    (q: ExamQuestionDTO, text: string) => {
      if (locked) return;
      setTexts((t) => ({ ...t, [q.id]: text }));
      latest.current.set(q.id, { text });
      setSaves((s) => ({ ...s, [q.id]: 'saving' }));
      const prev = textTimers.current.get(q.id);
      if (prev !== undefined) clearTimeout(prev);
      textTimers.current.set(
        q.id,
        setTimeout(() => flushText(q.id), TEXT_SAVE_DELAY_MS),
      );
    },
    [locked, flushText],
  );

  useEffect(() => () => textTimers.current.forEach(clearTimeout), []);

  const retryFailed = () => {
    for (const [qid, st] of Object.entries(saves)) if (st === 'error') void persist(Number(qid));
  };

  // ── التسليم (يدوي أو تلقائي): نحفظ الكتابة المعلّقة وننتظر الحفظ الجاري أولاً ─
  const submitM = useMutation({
    mutationFn: async () => {
      for (const qid of [...textTimers.current.keys()]) flushText(qid);
      await Promise.allSettled([...inflight.current.values()]);
      return examsApi.submit(session.attemptId);
    },
    onSuccess: (r) => {
      setDone(true);
      leaving.current = true;
      qc.setQueryData(['exam-result', r.attemptId], r);
      void qc.invalidateQueries({ queryKey: ['exams'] });
      void qc.invalidateQueries({ queryKey: ['me'] }); // لوحة الطالب: الرصيد/الاشتراكات/المطلوب
      // جلسة الامتحان تُحذف وحدها عند مغادرة الصفحة (gcTime: 0). حذفها هنا والمشغّل ما زال معروضاً
      // (صفحة النتيجة تُحمَّل كسولاً) كان يعيد جلبها ← طلب start زائد (409) بعد التسليم
      toast.success(r.status === 'EXPIRED' ? 'انتهى الوقت وتم تسليم إجاباتك' : 'تم تسليم الامتحان');
      navigate(`/dashboard/exams/result/${r.attemptId}`, { replace: true });
    },
    onError: (e) => {
      const msg = apiErrorMessage(e, 'تعذّر التسليم — تحقق من الاتصال وحاول مرة أخرى');
      toast.error(msg);
      // خطأ دائم ← لا إعادة تلقائية (يُعرض للطالب بدل تكرار الطلب بلا فائدة)
      if (permanent(e)) setSubmitBlocked(msg);
      setDone(false);
    },
  });
  const { mutate: submitMutate, isPending: submitting, isSuccess: submitted } = submitM;
  const submit = useCallback(() => {
    if (submitting || submitted) return;
    setDone(true);
    setConfirming(false);
    submitMutate();
  }, [submitMutate, submitting, submitted]);

  // التسليم التلقائي عند الصفر — ولو فشل لانقطاع الاتصال يُعاد كل 5 ثوانٍ، ولا يُعاد لخطأ دائم
  useEffect(() => {
    if (!expired || submitting || submitted || submitBlocked) return;
    if (submitM.isError) {
      const t = setTimeout(submit, 5000);
      return () => clearTimeout(t);
    }
    submit();
  }, [expired, submitting, submitted, submitBlocked, submitM.isError, submit]);

  // تنبيه آخر دقيقة: شريط لا يحجب النقر (نافذة تحجب الشاشة تضيّع ثواني الطالب الأخيرة)
  const [lowWarn, setLowWarn] = useState(false);
  const onLow = useCallback(() => setLowWarn(true), []);
  useEffect(() => {
    if (!lowWarn) return;
    const t = setTimeout(() => setLowWarn(false), 6000);
    return () => clearTimeout(t);
  }, [lowWarn]);
  const onExpire = useCallback(() => setExpired(true), []);

  // ── منع الخروج أثناء الامتحان ─────────────────────────────────────
  const active = !submitted;
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => !leaving.current && active && currentLocation.pathname !== nextLocation.pathname,
  );

  const isAnswered = (q: ExamQuestionDTO) =>
    isManualQuestion(q.type) ? !!texts[q.id]?.trim() : answers[q.id] !== undefined;
  const answered = questions.filter(isAnswered).length;
  const saving = Object.values(saves).some((s) => s === 'saving');
  const failed = Object.values(saves).some((s) => s === 'error');
  const current = questions[index]!;

  const card = (q: ExamQuestionDTO, i: number) => (
    <QuestionCard
      key={q.id}
      q={q}
      n={i + 1}
      total={questions.length}
      selected={answers[q.id]}
      text={texts[q.id] ?? ''}
      save={saves[q.id]}
      disabled={locked}
      onChoose={choose}
      onWrite={write}
      onBlurText={flushText}
    />
  );

  return (
    <Shell timer={<Countdown deadline={deadline} offset={offset} onLow={onLow} onExpire={onExpire} />}>
      {lowWarn && !submitted && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center px-4" role="alert">
          <span className="tag gap-2 bg-coral-500 px-4 py-2 text-sm font-semibold text-white shadow-soft">
            <AlertTriangle size={16} /> باقي أقل من دقيقة! راجع إجاباتك بسرعة
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">امتحان</div>
          <h1 className="mt-2 font-display text-2xl font-extrabold text-ink-900 sm:text-3xl">{session.title}</h1>
        </div>
        <SaveIndicator saving={saving} failed={failed} onRetry={retryFailed} />
      </div>

      {/* شريط التقدّم + التنقّل بين الأسئلة */}
      <div className="card mt-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold text-ink-700">
            أجبت عن <span className="tabular-nums">{answered}</span> من <span className="tabular-nums">{questions.length}</span>
          </span>
          <div className="inline-flex rounded-full border border-ink-900/10 bg-paper-50 p-1">
            <ModeButton active={mode === 'one'} onClick={() => setMode('one')} icon={SquareStack} label="سؤال سؤال" />
            <ModeButton active={mode === 'all'} onClick={() => setMode('all')} icon={LayoutList} label="كل الأسئلة" />
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper-100">
          <div className="h-full rounded-full bg-lime-400 transition-all" style={{ width: `${(answered / questions.length) * 100}%` }} />
        </div>
        {mode === 'one' && (
          <div className="mt-4 flex flex-wrap gap-2" aria-label="الأسئلة">
            {questions.map((q, i) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index}
                aria-label={`السؤال ${i + 1}${isAnswered(q) ? ' (تمت الإجابة)' : ''}`}
                className={`grid h-9 w-9 place-items-center rounded-full border text-sm font-bold tabular-nums transition ${
                  i === index
                    ? 'border-ink-900 bg-ink-900 text-paper'
                    : isAnswered(q)
                      ? 'border-ink-900/20 bg-lime-200 text-ink-900'
                      : 'border-ink-900/15 bg-white text-ink-500 hover:border-ink-900/40'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 space-y-5">{mode === 'one' ? card(current, index) : questions.map(card)}</div>

      {submitBlocked && (
        <p className="mt-5 flex items-start gap-2 rounded-2xl bg-coral-100 p-4 text-sm font-semibold text-coral-700" role="alert">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" /> {submitBlocked}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        {mode === 'one' ? (
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
              <ChevronRight size={18} /> السابق
            </button>
            <button
              type="button"
              className="btn-dark"
              disabled={index === questions.length - 1}
              onClick={() => setIndex((i) => i + 1)}
            >
              التالي <ChevronLeft size={18} />
            </button>
          </div>
        ) : (
          <span />
        )}
        <button type="button" className="btn-primary px-6" disabled={submitting} onClick={() => setConfirming(true)}>
          {submitting ? <Spinner /> : <Send size={18} />} تسليم الامتحان
        </button>
      </div>

      <Modal open={confirming} onClose={() => setConfirming(false)} title="تسليم الامتحان؟">
        <p className="leading-7 text-ink-600">
          {answered < questions.length ? (
            <>
              لم تُجب عن <b className="text-coral-600">{questions.length - answered}</b> سؤال. بعد التسليم لا يمكن تعديل إجاباتك.
            </>
          ) : (
            'أجبت عن كل الأسئلة. بعد التسليم لا يمكن تعديل إجاباتك.'
          )}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn-ghost" onClick={() => setConfirming(false)}>
            أراجع إجاباتي
          </button>
          <button type="button" className="btn-primary" onClick={submit}>
            <Send size={18} /> سلّم الآن
          </button>
        </div>
      </Modal>

      <Modal open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} title="تخرج من الامتحان؟">
        <p className="leading-7 text-ink-600">
          إجاباتك محفوظة، لكن <b>الوقت مستمر</b> ولن يتوقف. يمكنك العودة قبل انتهائه، وإلا يُسلَّم تلقائياً.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn-primary" onClick={() => blocker.reset?.()}>
            أكمل الامتحان
          </button>
          <button type="button" className="btn-ghost" onClick={() => blocker.proceed?.()}>
            اخرج
          </button>
        </div>
      </Modal>

      {submitting && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 backdrop-blur-sm">
          <div className="card flex items-center gap-3 px-6 py-4 font-semibold text-ink-900">
            <Spinner className="h-5 w-5 text-brand-500" /> جارٍ تسليم إجاباتك...
          </div>
        </div>
      )}
    </Shell>
  );
}

// العدّاد: يحدّث نفسه فقط، ويبلّغ المشغّل مرة عند اقتراب النهاية ومرة عند الصفر
function Countdown({
  deadline,
  offset,
  onLow,
  onExpire,
}: {
  deadline: number;
  offset: number;
  onLow: () => void;
  onExpire: () => void;
}) {
  const remainingMs = useCallback(() => deadline - (Date.now() + offset), [deadline, offset]);
  const [ms, setMs] = useState(remainingMs);
  // يُنبَّه مرة حتى لو فُتحت الصفحة وباقي أقل من دقيقة
  const lowFired = useRef(ms <= 0);
  const expiredFired = useRef(ms <= 0);

  useEffect(() => {
    const t = setInterval(() => {
      const left = remainingMs();
      // إعادة الرسم مرة كل ثانية معروضة فقط
      setMs((prev) => (Math.ceil(prev / 1000) === Math.ceil(left / 1000) ? prev : left));
      if (!lowFired.current && left > 0 && left <= EXAM_WARN_SEC * 1000) {
        lowFired.current = true;
        onLow();
      }
      if (!expiredFired.current && left <= 0) {
        expiredFired.current = true;
        onExpire();
      }
    }, 250);
    return () => clearInterval(t);
  }, [remainingMs, onLow, onExpire]);

  const low = ms <= EXAM_WARN_SEC * 1000;
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const text = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return (
    <span
      role="timer"
      aria-live={low ? 'assertive' : 'off'}
      aria-label={`الوقت المتبقي ${text}`}
      className={`tag gap-2 px-4 py-2 text-base tabular-nums transition ${
        low ? 'animate-pulse bg-coral-500 text-white' : 'bg-ink-900 text-lime-300'
      }`}
      dir="ltr"
    >
      <Timer size={18} /> {text}
    </span>
  );
}

function SaveIndicator({ saving, failed, onRetry }: { saving: boolean; failed: boolean; onRetry: () => void }) {
  if (failed) {
    return (
      <button type="button" onClick={onRetry} className="tag bg-coral-100 px-3 py-1.5 text-coral-700 hover:bg-coral-200">
        <CloudOff size={15} /> لم يُحفظ — اضغط لإعادة المحاولة
      </button>
    );
  }
  if (saving) {
    return (
      <span className="tag bg-paper-100 px-3 py-1.5 text-ink-600" aria-live="polite">
        <CloudUpload size={15} /> جارٍ الحفظ...
      </span>
    );
  }
  return (
    <span className="tag bg-lime-200 px-3 py-1.5 text-ink-900" aria-live="polite">
      <CheckCircle2 size={15} /> كل إجاباتك محفوظة
    </span>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof LayoutList;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
        active ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-900'
      }`}
    >
      <Icon size={15} /> {label}
    </button>
  );
}

const QuestionCard = memo(function QuestionCard({
  q,
  n,
  total,
  selected,
  text,
  save,
  disabled,
  onChoose,
  onWrite,
  onBlurText,
}: {
  q: ExamQuestionDTO;
  n: number;
  total: number;
  selected: number | undefined;
  text: string;
  save: SaveState | undefined;
  disabled: boolean;
  onChoose: (q: ExamQuestionDTO, choiceId: number) => void;
  onWrite: (q: ExamQuestionDTO, text: string) => void;
  onBlurText: (questionId: number) => void;
}) {
  const tf = q.type === 'TRUEFALSE';
  const manual = isManualQuestion(q.type);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIdx = q.choices.findIndex((c) => c.id === selected);
  const max = ANSWER_TEXT_MAX[q.type];

  // مجموعة اختيار: Tab يدخلها مرة واحدة، والأسهم تنقل وتختار (يمين/يسار معكوسان في RTL)
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowRight' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + q.choices.length) % q.choices.length;
    refs.current[next]?.focus();
    onChoose(q, q.choices[next]!.id);
  };

  return (
    <section className="card p-5 sm:p-7" aria-labelledby={`q-${q.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold text-ink-500">
          السؤال <span className="tabular-nums">{n}</span> من <span className="tabular-nums">{total}</span>
        </span>
        <div className="flex items-center gap-2">
          <span className="tag bg-paper-100 text-ink-600">{QUESTION_TYPE_LABELS[q.type]}</span>
          <span className="tag bg-brand-50 text-brand-700">
            {q.points} {q.points === 1 ? 'درجة' : 'درجات'}
          </span>
          {save === 'saved' && <Check size={16} className="text-lime-700" aria-label="محفوظ" />}
        </div>
      </div>
      <h2 id={`q-${q.id}`} className="mt-3 whitespace-pre-line font-display text-xl font-bold leading-relaxed text-ink-900 sm:text-2xl">
        {q.text}
      </h2>
      {q.imageUrl && (
        <img
          src={q.imageUrl}
          alt=""
          loading="lazy"
          className="mt-4 max-h-72 w-auto max-w-full rounded-2xl border border-ink-900/10 bg-paper-50 object-contain"
        />
      )}

      {manual ? (
        <div className="mt-5">
          {q.type === 'ESSAY' ? (
            <textarea
              className="input min-h-40 text-base leading-7"
              aria-labelledby={`q-${q.id}`}
              placeholder="اكتب إجابتك هنا..."
              maxLength={max}
              disabled={disabled}
              value={text}
              onChange={(e) => onWrite(q, e.target.value)}
              onBlur={() => onBlurText(q.id)}
            />
          ) : (
            <input
              className="input text-base"
              aria-labelledby={`q-${q.id}`}
              placeholder={q.type === 'TERM' ? 'اكتب المصطلح العلمي' : 'اكتب الكلمة الناقصة'}
              maxLength={max}
              disabled={disabled}
              value={text}
              onChange={(e) => onWrite(q, e.target.value)}
              onBlur={() => onBlurText(q.id)}
            />
          )}
          <div className="mt-1.5 flex justify-between gap-3 text-xs text-ink-400">
            <span>تصحّحها مس آن بنفسها بعد التسليم</span>
            {q.type === 'ESSAY' && (
              <span className="tabular-nums" dir="ltr">
                {text.length}/{max}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className={`mt-5 grid gap-3 ${tf ? 'grid-cols-2' : 'sm:grid-cols-2'}`} role="radiogroup" aria-labelledby={`q-${q.id}`}>
          {q.choices.map((c, i) => {
            const isSel = selected === c.id;
            const focusable = selectedIdx === -1 ? i === 0 : isSel;
            return (
              <button
                key={c.id}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={isSel}
                tabIndex={focusable ? 0 : -1}
                disabled={disabled}
                onClick={() => onChoose(q, c.id)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={`flex min-h-14 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-right text-base font-semibold transition disabled:cursor-not-allowed ${
                  isSel
                    ? 'border-ink-900 bg-lime-200 text-ink-900 shadow-stamp-sm'
                    : 'border-ink-900/10 bg-white text-ink-800 hover:border-ink-900/40 hover:bg-paper-50'
                } ${tf ? 'justify-center' : ''}`}
              >
                {!tf && (
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
                      isSel ? 'bg-ink-900 text-lime-300' : 'bg-paper-100 text-ink-600'
                    }`}
                  >
                    {'أبجدهو'[i] ?? i + 1}
                  </span>
                )}
                <span className="leading-7">{c.text}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
});

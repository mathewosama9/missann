import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '../../components/ui/notify';
import {
  ArrowRight,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  BarChart3,
  Settings2,
  Lock,
  Timer,
  ListChecks,
  Bell,
  Shuffle,
  CheckCircle2,
  AlertTriangle,
  ClipboardList,
  PenLine,
  Megaphone,
  BookOpenCheck,
} from 'lucide-react';
import {
  GRADE_SHORT,
  QUESTION_TYPE_LABELS,
  RESULT_RELEASE_LABELS,
  isManualQuestion,
  type AdminExamDetailDTO,
  type AdminQuestionDTO,
  type QuestionInput,
  type QuestionType,
} from '@miss-ann/shared';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal, ConfirmDialog } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { ExamForm } from '../../features/exams/ExamForm';
import { QuestionEditor } from '../../features/exams/QuestionEditor';
import { adminExamsApi, type ExamPayload } from '../../features/exams/api';
import { apiErrorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

export function AdminExamBuilder() {
  const id = Number(useParams().id);
  const qc = useQueryClient();
  const key = ['admin', 'exam', id];
  const examQ = useQuery({ queryKey: key, queryFn: () => adminExamsApi.detail(id) });

  const [editingSettings, setEditingSettings] = useState(false);
  const [editor, setEditor] = useState<{ open: boolean; q: AdminQuestionDTO | null; type: QuestionType }>({
    open: false,
    q: null,
    type: 'MCQ',
  });
  const [deleteQ, setDeleteQ] = useState<number | null>(null);

  // كل الطفرات ترجع الامتحان المحدَّث ← نضعه في الكاش مباشرة
  const onExam = (msg: string) => (exam: AdminExamDetailDTO) => {
    qc.setQueryData(key, exam);
    void qc.invalidateQueries({ queryKey: ['admin', 'exams'] });
    toast.success(msg);
  };
  const onError = (e: unknown) => toast.error(apiErrorMessage(e));

  const settingsM = useMutation({
    mutationFn: (d: ExamPayload) => adminExamsApi.update(id, d),
    onSuccess: (e) => {
      onExam('تم حفظ الإعدادات')(e);
      setEditingSettings(false);
    },
    onError,
  });
  const publishM = useMutation({
    mutationFn: (isPublished: boolean) => adminExamsApi.update(id, { isPublished }),
    onSuccess: (e) => onExam(e.isPublished ? 'تم نشر الامتحان للطلاب' : 'تم إخفاء الامتحان')(e),
    onError,
  });
  const saveQ = useMutation({
    mutationFn: (d: QuestionInput) =>
      editor.q ? adminExamsApi.updateQuestion(editor.q.id, d) : adminExamsApi.addQuestion(id, d),
    onSuccess: (e) => {
      onExam(editor.q ? 'تم تعديل السؤال' : 'تمت إضافة السؤال')(e);
      setEditor((s) => ({ ...s, open: false }));
    },
    onError,
  });
  const removeQ = useMutation({
    mutationFn: (qid: number) => adminExamsApi.removeQuestion(qid),
    onSuccess: (e) => {
      onExam('تم حذف السؤال')(e);
      setDeleteQ(null);
    },
    onError: (e) => {
      onError(e);
      setDeleteQ(null);
    },
  });
  const releaseM = useMutation({
    mutationFn: (released: boolean) => adminExamsApi.release(id, released),
    onSuccess: (e) => onExam(e.resultsReleasedAt ? 'تم إعلان النتائج للطلاب' : 'تم إخفاء النتائج')(e),
    onError,
  });
  const reorderM = useMutation({
    mutationFn: (items: { id: number; order: number }[]) => adminExamsApi.reorder(id, items),
    onSuccess: (e) => qc.setQueryData(key, e),
    onError,
  });

  if (examQ.isPending) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="h-8 w-8 text-brand-500" />
      </div>
    );
  }
  if (examQ.isError) return <EmptyState icon={AlertTriangle} title="تعذّر تحميل الامتحان" text={apiErrorMessage(examQ.error)} />;

  const exam = examQ.data;
  const move = (i: number, dir: -1 | 1) => {
    const qs = [...exam.questions];
    const j = i + dir;
    if (j < 0 || j >= qs.length) return;
    [qs[i], qs[j]] = [qs[j]!, qs[i]!];
    qc.setQueryData(key, { ...exam, questions: qs }); // تفاؤلي
    reorderM.mutate(qs.map((q, order) => ({ id: q.id, order })));
  };
  const openNew = (type: QuestionType) => setEditor({ open: true, q: null, type });

  return (
    <div className="space-y-6">
      <Link to="/admin/exams" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
        <ArrowRight size={16} /> الامتحانات
      </Link>

      {/* رأس الامتحان */}
      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="tag bg-paper-100 text-ink-700">{exam.courseTitle ?? GRADE_SHORT[exam.grade]}</span>
              {exam.isPublished ? (
                <span className="tag bg-lime-200 text-ink-900">منشور</span>
              ) : (
                <span className="tag bg-paper-100 text-ink-500">مسودة</span>
              )}
            </div>
            <h1 className="mt-2 font-display text-3xl font-extrabold text-ink-900">{exam.title}</h1>
            {exam.description && <p className="mt-1 text-ink-500">{exam.description}</p>}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-600">
              <span className="inline-flex items-center gap-1.5">
                <Timer size={15} className="text-ink-400" /> {exam.durationMin} دقيقة
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ListChecks size={15} className="text-ink-400" /> {exam.questionsCount} سؤال · {exam.totalPoints} درجة · النجاح{' '}
                {exam.passScore}%
              </span>
              {(exam.startAt || exam.endAt) && (
                <span>
                  {exam.startAt ? formatDateTime(exam.startAt) : '—'} ← {exam.endAt ? formatDateTime(exam.endAt) : '—'}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Megaphone size={15} className="text-ink-400" /> النتيجة: {RESULT_RELEASE_LABELS[exam.resultRelease]}
                {exam.resultRelease === 'MANUAL' && (exam.resultsReleasedAt ? ' (مُعلنة)' : ' (لم تُعلن بعد)')}
              </span>
              {exam.shuffle && (
                <span className="inline-flex items-center gap-1.5">
                  <Shuffle size={15} className="text-ink-400" /> خلط
                </span>
              )}
              {exam.notifyParent && (
                <span className="inline-flex items-center gap-1.5 text-brand-600">
                  <Bell size={15} /> إشعار ولي الأمر
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={() => setEditingSettings(true)}>
              <Settings2 size={17} /> الإعدادات
            </button>
            <Link to={`/admin/exams/${exam.id}/analytics`} className="btn-ghost">
              <BarChart3 size={17} /> النتائج والتحليلات
            </Link>
            {exam.pendingGrading > 0 && (
              <Link to={`/admin/exams/${exam.id}/analytics?grading=PENDING`} className="btn-ghost text-coral-700">
                <PenLine size={17} /> للتصحيح ({exam.pendingGrading})
              </Link>
            )}
            {exam.resultRelease === 'MANUAL' && (
              <button
                type="button"
                className={exam.resultsReleasedAt ? 'btn-ghost' : 'btn-primary'}
                disabled={releaseM.isPending || (!exam.resultsReleasedAt && exam.attemptsCount === 0)}
                onClick={() => releaseM.mutate(!exam.resultsReleasedAt)}
                title={exam.pendingGrading > 0 ? 'بعض المحاولات لم تُصحَّح بعد — ستظهر نتيجتها فور تصحيحها' : undefined}
              >
                <Megaphone size={17} /> {exam.resultsReleasedAt ? 'إخفاء النتائج' : 'إعلان النتائج'}
              </button>
            )}
            <button
              type="button"
              className={exam.isPublished ? 'btn-dark' : 'btn-accent'}
              disabled={publishM.isPending || (!exam.isPublished && exam.questions.length === 0)}
              onClick={() => publishM.mutate(!exam.isPublished)}
              title={exam.questions.length === 0 ? 'أضف سؤالاً أولاً' : undefined}
            >
              {exam.isPublished ? <EyeOff size={17} /> : <Eye size={17} />} {exam.isPublished ? 'إخفاء' : 'نشر'}
            </button>
          </div>
        </div>
      </div>

      {exam.locked && (
        <div className="flex items-start gap-3 rounded-3xl border border-ink-900/10 bg-paper-100 p-4 text-sm leading-6 text-ink-700">
          <Lock size={18} className="mt-0.5 shrink-0" />
          <span>
            بدأ <b>{exam.attemptsCount}</b> طالب هذا الامتحان، لذلك الأسئلة مقفولة: يمكنك تصحيح النصوص والصور وإعادة الترتيب فقط،
            دون تغيير الإجابات الصحيحة أو الدرجات أو إضافة/حذف أسئلة.
          </span>
        </div>
      )}

      {/* الأسئلة */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-extrabold text-ink-900">الأسئلة</h2>
        {!exam.locked && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => openNew('MCQ')}>
              <Plus size={17} /> اختيار من متعدد
            </button>
            <button type="button" className="btn-dark" onClick={() => openNew('TRUEFALSE')}>
              <Plus size={17} /> صح أو خطأ
            </button>
            <button type="button" className="btn-ghost" onClick={() => openNew('ESSAY')}>
              <PenLine size={17} /> سؤال كتابي
            </button>
          </div>
        )}
      </div>

      {exam.questions.length === 0 ? (
        <EmptyState icon={ClipboardList} title="لا أسئلة بعد" text="أضف أسئلة اختيار من متعدد أو صح/خطأ، ثم انشر الامتحان." />
      ) : (
        <ol className="space-y-3">
          {exam.questions.map((q, i) => (
            <li key={q.id} className="card p-5">
              <div className="flex items-start gap-4">
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <button
                    type="button"
                    className="btn-icon h-8 w-8"
                    disabled={i === 0 || reorderM.isPending}
                    onClick={() => move(i, -1)}
                    aria-label="تحريك لأعلى"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <span className="font-display text-lg font-extrabold text-ink-900 tabular-nums">{i + 1}</span>
                  <button
                    type="button"
                    className="btn-icon h-8 w-8"
                    disabled={i === exam.questions.length - 1 || reorderM.isPending}
                    onClick={() => move(i, 1)}
                    aria-label="تحريك لأسفل"
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      <span className="tag bg-paper-100 text-ink-600">{QUESTION_TYPE_LABELS[q.type]}</span>
                      <span className="tag bg-brand-50 text-brand-700">{q.points} درجة</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-paper-100"
                        onClick={() => setEditor({ open: true, q, type: q.type })}
                        title="تعديل"
                      >
                        <Pencil size={17} />
                      </button>
                      {!exam.locked && (
                        <button
                          type="button"
                          className="grid h-9 w-9 place-items-center rounded-full text-coral-600 hover:bg-coral-100"
                          onClick={() => setDeleteQ(q.id)}
                          title="حذف"
                        >
                          <Trash2 size={17} />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-line font-semibold leading-7 text-ink-900">{q.text}</p>
                  {q.imageUrl && (
                    <img src={q.imageUrl} alt="" loading="lazy" className="mt-2 max-h-40 max-w-full rounded-2xl border border-ink-900/10 object-contain" />
                  )}
                  {isManualQuestion(q.type) ? (
                    <div className="mt-3 rounded-2xl bg-paper-100 p-3 text-sm leading-6 text-ink-700">
                      <div className="inline-flex items-center gap-1.5 font-semibold">
                        <BookOpenCheck size={15} /> {q.modelAnswer ? 'الإجابة النموذجية' : 'يُصحَّح يدوياً'}
                      </div>
                      {q.modelAnswer && <p className="mt-1 whitespace-pre-line">{q.modelAnswer}</p>}
                    </div>
                  ) : (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {q.choices.map((c) => (
                      <li
                        key={c.id}
                        className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm ${
                          c.isCorrect ? 'border-lime-500 bg-lime-200 font-semibold text-ink-900' : 'border-ink-900/10 text-ink-600'
                        }`}
                      >
                        {c.isCorrect ? <CheckCircle2 size={16} className="shrink-0" /> : <span className="w-4" />}
                        {c.text}
                      </li>
                    ))}
                  </ul>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <Modal open={editingSettings} onClose={() => setEditingSettings(false)} title="إعدادات الامتحان" size="lg">
        <ExamForm
          initial={exam}
          onSubmit={(d) => settingsM.mutate(d)}
          onCancel={() => setEditingSettings(false)}
          saving={settingsM.isPending}
        />
      </Modal>
      <QuestionEditor
        open={editor.open}
        initial={editor.q}
        newType={editor.type}
        locked={exam.locked}
        saving={saveQ.isPending}
        onClose={() => setEditor((s) => ({ ...s, open: false }))}
        onSubmit={(d) => saveQ.mutate(d)}
      />
      <ConfirmDialog
        open={deleteQ !== null}
        onClose={() => setDeleteQ(null)}
        onConfirm={() => deleteQ !== null && removeQ.mutate(deleteQ)}
        title="حذف السؤال"
        message="سيُحذف السؤال واختياراته نهائياً. هل أنت متأكد؟"
        loading={removeQ.isPending}
      />
    </div>
  );
}

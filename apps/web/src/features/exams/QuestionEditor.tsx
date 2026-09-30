import { useEffect, useRef, useState } from 'react';
import { toast } from '../../components/ui/notify';
import { Plus, Trash2, ImagePlus, X, CheckCircle2, Circle, Lock } from 'lucide-react';
import {
  QUESTION_TYPE_LABELS,
  QuestionType as QT,
  isManualQuestion,
  TRUEFALSE_CHOICES,
  UPLOAD_LIMITS,
  type AdminQuestionDTO,
  type QuestionInput,
  type QuestionType,
} from '@miss-ann/shared';
import { Modal } from '../../components/ui/Modal';
import { Field } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { apiErrorMessage } from '../../lib/api';
import { adminExamsApi } from './api';

interface Draft {
  id?: number;
  text: string;
  isCorrect: boolean;
}

const blank = (type: QuestionType): Draft[] =>
  isManualQuestion(type)
    ? []
    : type === 'TRUEFALSE'
    ? TRUEFALSE_CHOICES.map((t, i) => ({ text: t, isCorrect: i === 0 }))
    : [
        { text: '', isCorrect: true },
        { text: '', isCorrect: false },
        { text: '', isCorrect: false },
      ];

// نفس قواعد الخادم (questionInput) — رسالة واضحة قبل الإرسال
function validate(text: string, choices: Draft[], type: QuestionType): string | null {
  if (!text.trim()) return 'اكتب نص السؤال';
  if (isManualQuestion(type)) return null;
  if (choices.some((c) => !c.text.trim())) return 'اكتب نص كل الاختيارات';
  if (choices.filter((c) => c.isCorrect).length !== 1) return 'حدّد إجابة صحيحة واحدة';
  if (type === 'TRUEFALSE' && choices.length !== 2) return 'سؤال صح/خطأ له اختياران';
  if (type === 'MCQ' && choices.length < 2) return 'اختياران على الأقل';
  if (new Set(choices.map((c) => c.text.trim())).size !== choices.length) return 'لا تكرّر نفس الاختيار';
  return null;
}

export function QuestionEditor({
  open,
  initial,
  newType,
  locked,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial: AdminQuestionDTO | null;
  newType: QuestionType;
  locked: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (data: QuestionInput) => void;
}) {
  const [type, setType] = useState<QuestionType>(newType);
  const [text, setText] = useState('');
  const [points, setPoints] = useState('1');
  const [imageUrl, setImageUrl] = useState('');
  const [modelAnswer, setModelAnswer] = useState('');
  const [choices, setChoices] = useState<Draft[]>(blank(newType));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = initial?.type ?? newType;
    setType(t);
    setText(initial?.text ?? '');
    setPoints(String(initial?.points ?? 1));
    setImageUrl(initial?.imageUrl ?? '');
    setModelAnswer(initial?.modelAnswer ?? '');
    setChoices(initial ? initial.choices.map((c) => ({ id: c.id, text: c.text, isCorrect: c.isCorrect })) : blank(t));
    setError(null);
  }, [open, initial, newType]);

  const structural = !locked; // بعد المحاولات: النصوص والصورة فقط
  const tf = type === 'TRUEFALSE';
  const manual = isManualQuestion(type);

  const changeType = (t: QuestionType) => {
    setType(t);
    setChoices(blank(t));
  };
  const setCorrect = (i: number) => setChoices((cs) => cs.map((c, j) => ({ ...c, isCorrect: j === i })));
  const setChoiceText = (i: number, v: string) => setChoices((cs) => cs.map((c, j) => (j === i ? { ...c, text: v } : c)));
  const removeChoice = (i: number) =>
    setChoices((cs) => {
      const next = cs.filter((_, j) => j !== i);
      if (!next.some((c) => c.isCorrect) && next[0]) next[0] = { ...next[0], isCorrect: true };
      return next;
    });

  const upload = async (file: File) => {
    if (!UPLOAD_LIMITS.allowedImageTypes.includes(file.type)) return toast.error('الصورة يجب أن تكون JPG أو PNG أو WEBP');
    if (file.size > UPLOAD_LIMITS.imageMaxBytes) return toast.error('حجم الصورة أكبر من 5MB');
    setUploading(true);
    try {
      setImageUrl(await adminExamsApi.uploadImage(file));
    } catch (e) {
      toast.error(apiErrorMessage(e, 'تعذّر رفع الصورة'));
    } finally {
      setUploading(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate(text, choices, type);
    const pts = Number(points);
    if (err) return setError(err);
    if (!Number.isInteger(pts) || pts < 1 || pts > 100) return setError('الدرجة من 1 إلى 100');
    setError(null);
    onSubmit({
      type,
      text: text.trim(),
      points: pts,
      imageUrl: imageUrl.trim() || null,
      modelAnswer: manual ? modelAnswer.trim() || null : null,
      choices: manual ? [] : choices.map((c) => ({ ...(c.id && { id: c.id }), text: c.text.trim(), isCorrect: c.isCorrect })),
    });
  };

  return (
    <Modal open={open} onClose={saving ? () => undefined : onClose} title={initial ? 'تعديل السؤال' : 'سؤال جديد'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        {locked && (
          <div className="flex items-start gap-2 rounded-2xl bg-paper-100 p-3 text-sm text-ink-700">
            <Lock size={17} className="mt-0.5 shrink-0" />
            للامتحان محاولات: يمكنك تصحيح النصوص والصورة فقط حتى لا تتغيّر درجات من امتحنوا.
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <Field label="نوع السؤال">
            <div className="flex flex-wrap gap-1 rounded-3xl border border-ink-900/10 bg-paper-50 p-1">
              {Object.values(QT).map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={!structural || !!initial}
                  onClick={() => changeType(t)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed ${
                    type === t ? 'bg-ink-900 text-paper' : 'text-ink-500'
                  }`}
                >
                  {QUESTION_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </Field>
          <Field label="الدرجة">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              className="input"
              disabled={!structural}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
            />
          </Field>
        </div>

        <Field label="نص السؤال">
          <textarea className="input min-h-24" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>

        <div>
          <span className="label">صورة (اختياري)</span>
          {imageUrl ? (
            <div className="flex items-start gap-3">
              <img src={imageUrl} alt="" className="max-h-40 max-w-[60%] rounded-2xl border border-ink-900/10 object-contain" />
              <button type="button" className="btn-icon h-9 w-9" onClick={() => setImageUrl('')} aria-label="إزالة الصورة">
                <X size={17} />
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Spinner /> : <ImagePlus size={17} />} رفع صورة
              </button>
              <input
                className="input min-w-0 flex-1"
                dir="ltr"
                placeholder="أو الصق رابط https://"
                onBlur={(e) => e.target.value.trim() && setImageUrl(e.target.value.trim())}
              />
              <input
                ref={fileRef}
                type="file"
                accept={UPLOAD_LIMITS.allowedImageTypes.join(',')}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void upload(f);
                }}
              />
            </div>
          )}
        </div>

        {manual ? (
          <Field label="الإجابة النموذجية (اختياري)" hint="تظهر لكِ وقت التصحيح، وللطالب في المراجعة بعد ظهور النتيجة. هذا السؤال يُصحَّح يدوياً.">
            <textarea
              className="input min-h-20"
              maxLength={2000}
              value={modelAnswer}
              onChange={(e) => setModelAnswer(e.target.value)}
            />
          </Field>
        ) : (
        <div>
          <span className="label">الاختيارات — اضغط الدائرة لتحديد الإجابة الصحيحة</span>
          <ul className="space-y-2">
            {choices.map((c, i) => (
              <li key={c.id ?? `n${i}`} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!structural}
                  onClick={() => setCorrect(i)}
                  aria-label={c.isCorrect ? 'الإجابة الصحيحة' : 'اجعلها الإجابة الصحيحة'}
                  aria-pressed={c.isCorrect}
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition disabled:cursor-not-allowed ${
                    c.isCorrect ? 'bg-lime-300 text-ink-900' : 'bg-paper-100 text-ink-400 hover:text-ink-700'
                  }`}
                >
                  {c.isCorrect ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                </button>
                <input
                  className={`input ${c.isCorrect ? 'border-lime-500 bg-lime-100' : ''}`}
                  value={c.text}
                  maxLength={300}
                  readOnly={tf && structural}
                  placeholder={`الاختيار ${i + 1}`}
                  onChange={(e) => setChoiceText(i, e.target.value)}
                />
                {!tf && structural && choices.length > 2 && (
                  <button
                    type="button"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-coral-600 hover:bg-coral-100"
                    onClick={() => removeChoice(i)}
                    aria-label="حذف الاختيار"
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!tf && structural && choices.length < 6 && (
            <button
              type="button"
              className="btn-ghost mt-2 px-4 py-2 text-sm"
              onClick={() => setChoices((cs) => [...cs, { text: '', isCorrect: false }])}
            >
              <Plus size={16} /> اختيار
            </button>
          )}
        </div>
        )}

        {error && <p className="rounded-2xl bg-coral-100 p-3 text-sm font-semibold text-coral-700">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </button>
          <button type="submit" className="btn-primary" disabled={saving || uploading}>
            {saving && <Spinner />} حفظ السؤال
          </button>
        </div>
      </form>
    </Modal>
  );
}

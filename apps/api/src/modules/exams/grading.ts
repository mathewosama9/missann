// ── التصحيح (دالة نقية بلا قاعدة بيانات — مغطّاة باختبار وحدة) ─────
// الموضوعي (اختيار/صح-خطأ): نقاط السؤال لو اختار الاختيار الصحيح.
// الكتابي (مقالي/أكمل/مصطلح): الدرجة التي أعطتها المس (awardedPoints)؛ إجابة مكتوبة لم تُصحَّح بعد ← pending.
// إجابة على سؤال خارج الامتحان أو باختيار لا ينتمي لسؤالها تُتجاهل (لا تُحتسب).
import { isManualQuestion, type QuestionType } from '@miss-ann/shared';

export interface GradableQuestion {
  id: number;
  type: QuestionType;
  points: number;
  choices: { id: number; isCorrect: boolean }[];
}

export interface GradableAnswer {
  questionId: number;
  choiceId: number | null;
  text: string | null;
  awardedPoints: number | null;
}

export interface GradeResult {
  score: number;
  totalPoints: number;
  answeredCount: number;
  // إجابات كتابية غير فارغة لم تصحّحها المس بعد
  pendingManual: number;
  earnedByQuestion: Map<number, number>;
}

// الإجابة الكتابية الفارغة (أو مسافات فقط) = بلا إجابة ← صفر بلا حاجة لتصحيح
export const hasText = (t: string | null | undefined): t is string => !!t && t.trim().length > 0;

export function gradeAnswers(questions: GradableQuestion[], answers: GradableAnswer[]): GradeResult {
  const byQuestion = new Map<number, GradableAnswer>();
  for (const a of answers) byQuestion.set(a.questionId, a);

  let score = 0;
  let totalPoints = 0;
  let answeredCount = 0;
  let pendingManual = 0;
  const earnedByQuestion = new Map<number, number>();

  for (const q of questions) {
    totalPoints += q.points;
    earnedByQuestion.set(q.id, 0);
    const a = byQuestion.get(q.id);
    if (!a) continue;

    if (isManualQuestion(q.type)) {
      if (!hasText(a.text)) continue;
      answeredCount++;
      if (a.awardedPoints === null) {
        pendingManual++;
        continue;
      }
      const earned = Math.min(Math.max(a.awardedPoints, 0), q.points);
      score += earned;
      earnedByQuestion.set(q.id, earned);
      continue;
    }

    const choice = q.choices.find((c) => c.id === a.choiceId);
    if (!choice) continue; // اختيار لا ينتمي لهذا السؤال
    answeredCount++;
    if (choice.isCorrect) {
      score += q.points;
      earnedByQuestion.set(q.id, q.points);
    }
  }
  return { score, totalPoints, answeredCount, pendingManual, earnedByQuestion };
}

// الحالة النهائية للمحاولة حسب وقت التسليم مقابل موعد الخادم (+ سماحية الشبكة)
export function finalStatus(now: Date, deadlineAt: Date, graceSec: number): 'SUBMITTED' | 'EXPIRED' {
  return now.getTime() <= deadlineAt.getTime() + graceSec * 1000 ? 'SUBMITTED' : 'EXPIRED';
}

// موعد الانتهاء = البداية + المدة، بحد أقصى نهاية نافذة الامتحان
export function computeDeadline(startedAt: Date, durationMin: number, endAt: Date | null): Date {
  const byDuration = new Date(startedAt.getTime() + durationMin * 60_000);
  return endAt && endAt < byDuration ? endAt : byDuration;
}

// ── متى تظهر النتيجة للطالب ──────────────────────────────────────
// المحاولة لازم تكون مصحّحة بالكامل (gradedAt)، ثم حسب إعداد الامتحان:
// IMMEDIATE فوراً؛ AFTER_END بعد endAt (+ السماحية: لا محاولة جارية بعدها لأن المواعيد ≤ endAt
// و endAt لا يُقدَّم بعد أول محاولة)؛ MANUAL عندما تعلنها المس.
export interface ReleaseInfo {
  resultRelease: 'IMMEDIATE' | 'AFTER_END' | 'MANUAL';
  resultsReleasedAt: Date | null;
  endAt: Date | null;
}

export function isReleased(exam: ReleaseInfo, graceSec: number, now = new Date()): boolean {
  if (exam.resultRelease === 'IMMEDIATE') return true;
  if (exam.resultRelease === 'MANUAL') return exam.resultsReleasedAt !== null;
  return !!exam.endAt && now.getTime() >= exam.endAt.getTime() + graceSec * 1000;
}

export function resultState(
  exam: ReleaseInfo,
  attempt: { status: string; gradedAt: Date | null },
  graceSec: number,
  now = new Date(),
): 'GRADING' | 'WAITING' | 'VISIBLE' | null {
  if (attempt.status === 'IN_PROGRESS') return null;
  if (!attempt.gradedAt) return 'GRADING';
  return isReleased(exam, graceSec, now) ? 'VISIBLE' : 'WAITING';
}

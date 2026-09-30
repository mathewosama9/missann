import { describe, it, expect } from 'vitest';
import {
  computeDeadline,
  finalStatus,
  gradeAnswers,
  isReleased,
  resultState,
  type GradableAnswer,
  type GradableQuestion,
} from '../src/modules/exams/grading.js';
import { examStars, scorePercent } from '@miss-ann/shared';

const questions: GradableQuestion[] = [
  { id: 1, type: 'MCQ', points: 2, choices: [{ id: 11, isCorrect: true }, { id: 12, isCorrect: false }] },
  { id: 2, type: 'MCQ', points: 3, choices: [{ id: 21, isCorrect: false }, { id: 22, isCorrect: true }, { id: 23, isCorrect: false }] },
  { id: 3, type: 'TRUEFALSE', points: 5, choices: [{ id: 31, isCorrect: true }, { id: 32, isCorrect: false }] },
];
const pick = (questionId: number, choiceId: number): GradableAnswer => ({ questionId, choiceId, text: null, awardedPoints: null });
const write = (questionId: number, text: string, awardedPoints: number | null = null): GradableAnswer => ({
  questionId,
  choiceId: null,
  text,
  awardedPoints,
});

describe('gradeAnswers — موضوعي', () => {
  it('يجمع نقاط الإجابات الصحيحة فقط', () => {
    const r = gradeAnswers(questions, [pick(1, 11), pick(2, 21), pick(3, 31)]);
    expect(r).toMatchObject({ score: 7, totalPoints: 10, answeredCount: 3, pendingManual: 0 });
    expect(Object.fromEntries(r.earnedByQuestion)).toEqual({ 1: 2, 2: 0, 3: 5 });
  });

  it('بلا إجابات ← صفر من المجموع الكامل', () => {
    expect(gradeAnswers(questions, [])).toMatchObject({ score: 0, totalPoints: 10, answeredCount: 0 });
  });

  it('كل الإجابات صحيحة ← الدرجة النهائية', () => {
    expect(gradeAnswers(questions, [pick(1, 11), pick(2, 22), pick(3, 31)]).score).toBe(10);
  });

  it('يتجاهل اختياراً من سؤال آخر أو سؤالاً خارج الامتحان', () => {
    const r = gradeAnswers(questions, [pick(1, 22), pick(99, 11)]);
    expect(r).toMatchObject({ score: 0, answeredCount: 0 });
  });

  it('آخر إجابة لنفس السؤال هي المعتمدة', () => {
    expect(gradeAnswers(questions, [pick(1, 12), pick(1, 11)]).score).toBe(2);
  });
});

describe('gradeAnswers — كتابي (تصحيح المس)', () => {
  const mixed: GradableQuestion[] = [
    ...questions,
    { id: 4, type: 'ESSAY', points: 4, choices: [] },
    { id: 5, type: 'TERM', points: 2, choices: [] },
    { id: 6, type: 'COMPLETE', points: 1, choices: [] },
  ];

  it('إجابة كتابية لم تُصحَّح ← pending والدرجة الموضوعية فقط', () => {
    const r = gradeAnswers(mixed, [pick(1, 11), write(4, 'التبخر هو ...'), write(5, 'التكثف')]);
    expect(r).toMatchObject({ score: 2, totalPoints: 17, pendingManual: 2, answeredCount: 3 });
  });

  it('بعد التصحيح ← تُضاف درجة المس، ولا pending', () => {
    const r = gradeAnswers(mixed, [pick(1, 11), write(4, 'التبخر هو ...', 3), write(5, 'التكثف', 2)]);
    expect(r).toMatchObject({ score: 7, pendingManual: 0 });
    expect(r.earnedByQuestion.get(4)).toBe(3);
  });

  it('الإجابة الفارغة أو المسافات = بلا إجابة (صفر بلا تصحيح)', () => {
    const r = gradeAnswers(mixed, [write(4, '   '), write(6, '')]);
    expect(r).toMatchObject({ score: 0, pendingManual: 0, answeredCount: 0 });
  });

  it('درجة المس لا تتجاوز درجة السؤال ولا تقل عن صفر', () => {
    expect(gradeAnswers(mixed, [write(6, 'x', 9)]).score).toBe(1);
    expect(gradeAnswers(mixed, [write(6, 'x', -3)]).score).toBe(0);
  });

  it('اختيار على سؤال كتابي يُتجاهل', () => {
    expect(gradeAnswers(mixed, [pick(4, 11)])).toMatchObject({ score: 0, answeredCount: 0, pendingManual: 0 });
  });
});

describe('time rules', () => {
  const start = new Date('2026-09-29T10:00:00Z');

  it('deadline = البداية + المدة', () => {
    expect(computeDeadline(start, 30, null).toISOString()).toBe('2026-09-29T10:30:00.000Z');
  });

  it('deadline لا يتجاوز نهاية نافذة الامتحان', () => {
    const endAt = new Date('2026-09-29T10:10:00Z');
    expect(computeDeadline(start, 30, endAt)).toEqual(endAt);
  });

  it('التسليم قبل الموعد (أو داخل سماحية الشبكة) SUBMITTED وبعده EXPIRED', () => {
    const deadline = new Date('2026-09-29T10:30:00Z');
    expect(finalStatus(new Date('2026-09-29T10:29:59Z'), deadline, 5)).toBe('SUBMITTED');
    expect(finalStatus(new Date('2026-09-29T10:30:05Z'), deadline, 5)).toBe('SUBMITTED');
    expect(finalStatus(new Date('2026-09-29T10:30:06Z'), deadline, 5)).toBe('EXPIRED');
  });
});

describe('result release', () => {
  const endAt = new Date('2026-09-29T11:00:00Z');
  const before = new Date('2026-09-29T10:59:00Z');
  const after = new Date('2026-09-29T11:00:05Z');

  it('IMMEDIATE ظاهرة دائماً؛ MANUAL بعد الإعلان فقط', () => {
    expect(isReleased({ resultRelease: 'IMMEDIATE', resultsReleasedAt: null, endAt: null }, 5, before)).toBe(true);
    expect(isReleased({ resultRelease: 'MANUAL', resultsReleasedAt: null, endAt }, 5, after)).toBe(false);
    expect(isReleased({ resultRelease: 'MANUAL', resultsReleasedAt: before, endAt: null }, 5, before)).toBe(true);
  });

  it('AFTER_END بعد النهاية + السماحية (لا محاولة جارية تستطيع الإجابة بعدها)', () => {
    const exam = { resultRelease: 'AFTER_END' as const, resultsReleasedAt: null, endAt };
    expect(isReleased(exam, 5, before)).toBe(false);
    expect(isReleased(exam, 5, new Date('2026-09-29T11:00:04Z'))).toBe(false);
    expect(isReleased(exam, 5, after)).toBe(true);
  });

  it('المحاولة غير المصحّحة بالكامل ← GRADING مهما كان الإعداد', () => {
    const exam = { resultRelease: 'IMMEDIATE' as const, resultsReleasedAt: null, endAt: null };
    expect(resultState(exam, { status: 'SUBMITTED', gradedAt: null }, 5)).toBe('GRADING');
    expect(resultState(exam, { status: 'SUBMITTED', gradedAt: before }, 5)).toBe('VISIBLE');
    expect(resultState(exam, { status: 'IN_PROGRESS', gradedAt: null }, 5)).toBeNull();
    expect(resultState({ ...exam, resultRelease: 'MANUAL' }, { status: 'EXPIRED', gradedAt: before }, 5)).toBe('WAITING');
  });
});

describe('score helpers', () => {
  it('النسبة والنجوم', () => {
    expect(scorePercent(7, 10)).toBe(70);
    expect(scorePercent(0, 0)).toBe(0);
    expect(examStars(95, 50)).toBe(3);
    expect(examStars(80, 50)).toBe(2);
    expect(examStars(55, 50)).toBe(1);
    expect(examStars(49, 50)).toBe(0);
    expect(examStars(70, 80)).toBe(0); // دون نسبة النجاح المحددة
  });
});

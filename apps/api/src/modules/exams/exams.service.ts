import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  EXAM_GRACE_SEC,
  examStars,
  isManualQuestion,
  scorePercent,
  type AnswerInput,
  type AnswerSavedDTO,
  type AttemptResultDTO,
  type AttemptSessionDTO,
  type ExamListItemDTO,
  type ExamQuestionDTO,
  type ExamState,
  type Grade,
} from '@miss-ann/shared';
import { LOCKED_TX, prisma } from '../../lib/prisma.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';
import { enqueue, JOBS } from '../../lib/queue.js';
import { computeDeadline, finalStatus, gradeAnswers, isReleased, resultState } from './grading.js';

type Tx = Prisma.TransactionClient;
const GRACE_MS = EXAM_GRACE_SEC * 1000;

const examFinished = () => new AppError(409, 'انتهى هذا الامتحان بالنسبة لك', 'EXAM_FINISHED');
const timeUp = () => new AppError(409, 'انتهى وقت الامتحان', 'EXAM_TIME_UP');
const overdue = (deadlineAt: Date, now = new Date()) => now.getTime() > deadlineAt.getTime() + GRACE_MS;

// ── الوصول: امتحان عام لصف الطالب، أو امتحان كورس باشتراك ساري، أو امتحان له فيه محاولة ─
function accessWhere(userId: number, grade: Grade | null, now: Date): Prisma.ExamWhereInput {
  const open: Prisma.ExamWhereInput[] = [
    { courseId: { not: null }, course: { enrollments: { some: { userId, expiresAt: { gt: now } } } } },
  ];
  if (grade) open.push({ courseId: null, grade });
  return {
    OR: [
      { isPublished: true, questions: { some: {} }, OR: open },
      { attempts: { some: { userId } } },
    ],
  };
}

async function studentGrade(userId: number): Promise<Grade | null> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { grade: true } });
  return u.grade;
}

const listInclude = (userId: number) =>
  ({
    course: { select: { title: true } },
    questions: { select: { points: true } },
    attempts: { where: { userId }, take: 1 },
  }) satisfies Prisma.ExamInclude;

type ExamWithList = Prisma.ExamGetPayload<{ include: ReturnType<typeof listInclude> }>;

function toListItem(e: ExamWithList, now: Date): ExamListItemDTO {
  const a = e.attempts[0] ?? null;
  let state: ExamState;
  if (a) state = a.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'FINISHED';
  else if (e.startAt && e.startAt > now) state = 'UPCOMING';
  else if (e.endAt && e.endAt <= now) state = 'MISSED';
  else state = 'OPEN';

  const rs = a ? resultState(e, a, EXAM_GRACE_SEC, now) : null;
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    grade: e.grade,
    courseId: e.courseId,
    courseTitle: e.course?.title ?? null,
    durationMin: e.durationMin,
    startAt: e.startAt?.toISOString() ?? null,
    endAt: e.endAt?.toISOString() ?? null,
    questionsCount: e.questions.length,
    totalPoints: e.questions.reduce((s, q) => s + q.points, 0),
    passScore: e.passScore,
    resultRelease: e.resultRelease,
    state,
    attempt: a && {
      id: a.id,
      status: a.status,
      resultState: rs,
      score: rs === 'VISIBLE' ? a.score : null,
      totalPoints: a.totalPoints,
      startedAt: a.startedAt.toISOString(),
      deadlineAt: a.deadlineAt.toISOString(),
      submittedAt: a.submittedAt?.toISOString() ?? null,
    },
  };
}

// محاولة تجاوزت موعدها ولم يلتقطها الكنّاس بعد ← تُغلق فوراً قبل عرض أي حالة
async function closeOverdueFor(userId: number, examIds?: number[]): Promise<void> {
  const stale = await prisma.examAttempt.findMany({
    where: {
      userId,
      status: 'IN_PROGRESS',
      deadlineAt: { lt: new Date(Date.now() - GRACE_MS) },
      ...(examIds && { examId: { in: examIds } }),
    },
    select: { id: true },
  });
  for (const s of stale) await finalizeAttempt(s.id, 'timeout');
}

// ── GET /api/exams ────────────────────────────────────────────────
export async function listExams(userId: number): Promise<ExamListItemDTO[]> {
  await closeOverdueFor(userId);
  const now = new Date();
  const exams = await prisma.exam.findMany({
    where: accessWhere(userId, await studentGrade(userId), now),
    include: listInclude(userId),
    orderBy: [{ startAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: 200,
  });
  return exams.map((e) => toListItem(e, now));
}

// ── GET /api/exams/:id (تفاصيل بلا أسئلة ولا isCorrect) ─────────────
export async function getExam(userId: number, examId: number): Promise<ExamListItemDTO> {
  await closeOverdueFor(userId, [examId]);
  const now = new Date();
  const exam = await prisma.exam.findFirst({
    where: { id: examId, ...accessWhere(userId, await studentGrade(userId), now) },
    include: listInclude(userId),
  });
  if (!exam) throw notFound('الامتحان غير موجود');
  return toListItem(exam, now);
}

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ── POST /api/exams/:id/start — ينشئ المحاولة أو يستأنفها (إعادة تحميل الصفحة) ─
export async function startExam(userId: number, examId: number): Promise<AttemptSessionDTO> {
  const now = new Date();
  const exam = await prisma.exam.findFirst({
    where: { id: examId, ...accessWhere(userId, await studentGrade(userId), now) },
    include: { questions: { select: { id: true, points: true, order: true }, orderBy: [{ order: 'asc' }, { id: 'asc' }] } },
  });
  if (!exam) throw notFound('الامتحان غير موجود');

  const existing = await prisma.examAttempt.findUnique({ where: { examId_userId: { examId, userId } }, select: { id: true } });
  if (existing) return resumeOrReject(existing.id);

  // محاولة جديدة: الامتحان منشور ونافذته مفتوحة
  if (!exam.isPublished || exam.questions.length === 0) throw notFound('الامتحان غير موجود');
  if (exam.startAt && exam.startAt > now) throw forbidden('الامتحان لم يبدأ بعد');
  if (exam.endAt && exam.endAt <= now) throw forbidden('انتهت فترة هذا الامتحان');

  const ids = exam.questions.map((q) => q.id);
  const deadlineAt = computeDeadline(now, exam.durationMin, exam.endAt);
  // ضغطتان متزامنتان على "ابدأ" ← القيد الفريد يُبقي محاولة واحدة (skipDuplicates بلا خطأ في السجلات)
  const { count } = await prisma.examAttempt.createMany({
    data: [
      {
        examId,
        userId,
        startedAt: now,
        deadlineAt,
        questionOrder: exam.shuffle ? shuffled(ids) : ids,
        totalPoints: exam.questions.reduce((s, q) => s + q.points, 0),
      },
    ],
    skipDuplicates: true,
  });
  const attempt = await prisma.examAttempt.findUniqueOrThrow({
    where: { examId_userId: { examId, userId } },
    select: { id: true, deadlineAt: true },
  });
  if (count === 0) return resumeOrReject(attempt.id);

  // job مؤجّل يغلق المحاولة عند موعدها لو لم يسلّم الطالب (الكنّاس الدوري شبكة أمان إضافية)
  void enqueue(
    'exams',
    JOBS.closeAttempt,
    { attemptId: attempt.id },
    { jobId: `close-attempt-${attempt.id}`, delay: attempt.deadlineAt.getTime() - Date.now() + GRACE_MS + 2_000 },
  );
  return buildSession(attempt.id);
}

async function resumeOrReject(attemptId: number): Promise<AttemptSessionDTO> {
  const a = await prisma.examAttempt.findUniqueOrThrow({ where: { id: attemptId }, select: { status: true, deadlineAt: true } });
  if (a.status !== 'IN_PROGRESS') throw examFinished();
  if (overdue(a.deadlineAt)) {
    await finalizeAttempt(attemptId, 'timeout');
    throw examFinished();
  }
  return buildSession(attemptId);
}

async function buildSession(attemptId: number): Promise<AttemptSessionDTO> {
  const attempt = await prisma.examAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: {
      exam: { select: { title: true } },
      answers: { select: { questionId: true, choiceId: true, text: true } },
    },
  });
  // select صريح: isCorrect والإجابة النموذجية لا يُقرآن أصلاً في هذا المسار
  const questions = await prisma.question.findMany({
    where: { examId: attempt.examId },
    select: {
      id: true,
      type: true,
      text: true,
      imageUrl: true,
      points: true,
      choices: { select: { id: true, text: true }, orderBy: [{ order: 'asc' }, { id: 'asc' }] },
    },
  });
  const pos = new Map(attempt.questionOrder.map((id, i) => [id, i]));
  questions.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9) || a.id - b.id);

  const answers: Record<number, number> = {};
  const texts: Record<number, string> = {};
  for (const a of attempt.answers) {
    if (a.choiceId !== null) answers[a.questionId] = a.choiceId;
    else if (a.text !== null) texts[a.questionId] = a.text;
  }

  return {
    attemptId: attempt.id,
    examId: attempt.examId,
    title: attempt.exam.title,
    status: attempt.status,
    startedAt: attempt.startedAt.toISOString(),
    deadlineAt: attempt.deadlineAt.toISOString(),
    serverNow: new Date().toISOString(),
    graceSec: EXAM_GRACE_SEC,
    questions: questions as ExamQuestionDTO[],
    answers,
    texts,
  };
}

// ── PATCH /api/attempts/:id/answer — حفظ تلقائي ─────────────────────
// عبارة SQL واحدة (بلا معاملة تفاعلية تحجز اتصالاً): قفل FOR SHARE على المحاولة ← التسليم (FOR UPDATE)
// ينتظر الحفظات الجارية، والحفظ بعده يرى الحالة الجديدة فلا يُكتب شيء بعد التصحيح.
// الملكية والحالة والوقت ونوع السؤال وانتماء الاختيار كلها شروط في نفس العبارة.
interface SaveRow {
  found: boolean;
  status: string | null;
  late: boolean | null;
  qtype: string | null;
  savedAt: Date | null;
}

export async function saveAnswer(userId: number, attemptId: number, input: AnswerInput): Promise<AnswerSavedDTO> {
  const choiceId = input.choiceId ?? null;
  const text = input.text ?? null;
  const [row] = await prisma.$queryRaw<SaveRow[]>`
    WITH att AS (
      SELECT id, "examId", status::text AS status,
             (now() at time zone 'utc') > "deadlineAt" + ${EXAM_GRACE_SEC}::int * interval '1 second' AS late
      FROM "ExamAttempt"
      WHERE id = ${attemptId} AND "userId" = ${userId}
      FOR SHARE
    ),
    q AS (
      SELECT q.id, q.type::text AS type
      FROM "Question" q JOIN att ON q."examId" = att."examId"
      WHERE q.id = ${input.questionId}
    ),
    ok AS (
      SELECT att.id AS "attemptId", q.id AS "questionId"
      FROM att, q
      WHERE att.status = 'IN_PROGRESS' AND NOT att.late AND (
        (q.type IN ('MCQ', 'TRUEFALSE') AND ${text}::text IS NULL
          AND EXISTS (SELECT 1 FROM "Choice" c WHERE c.id = ${choiceId}::int AND c."questionId" = q.id))
        OR
        (q.type IN ('ESSAY', 'COMPLETE', 'TERM') AND ${choiceId}::int IS NULL AND ${text}::text IS NOT NULL
          AND char_length(${text}::text) <= CASE q.type WHEN 'ESSAY' THEN 3000 ELSE 300 END)
      )
    ),
    ins AS (
      INSERT INTO "Answer" ("attemptId", "questionId", "choiceId", "text", "savedAt")
      SELECT "attemptId", "questionId", ${choiceId}::int, ${text}::text, now() at time zone 'utc' FROM ok
      ON CONFLICT ("attemptId", "questionId")
      DO UPDATE SET "choiceId" = EXCLUDED."choiceId", "text" = EXCLUDED."text", "savedAt" = EXCLUDED."savedAt"
      RETURNING "savedAt"
    )
    SELECT EXISTS (SELECT 1 FROM att) AS found,
           (SELECT status FROM att) AS status,
           (SELECT late FROM att) AS late,
           (SELECT type FROM q) AS qtype,
           (SELECT "savedAt" FROM ins) AS "savedAt"`;

  // نفس الرد لمحاولة غير موجودة أو لطالب آخر (لا IDOR ولا كشف وجود)
  if (!row?.found) throw notFound('المحاولة غير موجودة');
  if (row.status !== 'IN_PROGRESS') throw conflict('تم تسليم هذا الامتحان بالفعل');
  if (row.late) throw timeUp();
  if (!row.qtype || !row.savedAt) {
    throw badRequest(row.qtype && isManualQuestion(row.qtype as never) ? 'الإجابة طويلة جداً أو غير صالحة' : 'اختيار غير صالح لهذا السؤال');
  }
  return { questionId: input.questionId, savedAt: new Date(row.savedAt).toISOString() };
}

// ── الإغلاق والتصحيح (تسليم الطالب، الـ job المؤجّل، الكنّاس، الإغلاق الكسول) ─
// ذرّي ومتكرر بأمان: قفل صف المحاولة، ولا تصحيح إلا من IN_PROGRESS (لا إعادة تصحيح أبداً).
// فيها إجابات كتابية ← الدرجة جزئية و gradedAt فارغ حتى تصحّحها المس.
export async function finalizeAttempt(
  attemptId: number,
  reason: 'submit' | 'timeout',
): Promise<{ transitioned: boolean }> {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ExamAttempt" WHERE id = ${attemptId} FOR UPDATE`;
    const attempt = await tx.examAttempt.findUnique({
      where: { id: attemptId },
      select: {
        status: true,
        deadlineAt: true,
        examId: true,
        exam: { select: { notifyParent: true, resultRelease: true, resultsReleasedAt: true, endAt: true } },
      },
    });
    if (!attempt || attempt.status !== 'IN_PROGRESS') return { transitioned: false, notify: false };

    const now = new Date();
    // job مبكر (نادر) لا يغلق محاولة ما زال وقتها قائماً
    if (reason === 'timeout' && !overdue(attempt.deadlineAt, now)) return { transitioned: false, notify: false };

    const status = reason === 'submit' ? finalStatus(now, attempt.deadlineAt, EXAM_GRACE_SEC) : 'EXPIRED';
    const graded = await gradeInTx(tx, attemptId, attempt.examId);
    const gradedAt = graded.pendingManual === 0 ? now : null;
    await tx.examAttempt.update({
      where: { id: attemptId },
      data: {
        status,
        score: graded.score,
        totalPoints: graded.totalPoints,
        submittedAt: status === 'SUBMITTED' ? now : attempt.deadlineAt,
        gradedAt,
      },
    });
    const notify = attempt.exam.notifyParent && gradedAt !== null && isReleased(attempt.exam, EXAM_GRACE_SEC, now);
    return { transitioned: true, notify };
  }, LOCKED_TX);

  // إشعار ولي الأمر خارج المعاملة وبلا انتظار الطلب (غير ذلك: الكنّاس يدفعه عند ظهور النتيجة)
  if (result.notify) void queueParentNotification(attemptId);
  return { transitioned: result.transitioned };
}

export async function gradeInTx(tx: Tx, attemptId: number, examId: number) {
  const [questions, answers] = await Promise.all([
    tx.question.findMany({
      where: { examId },
      select: { id: true, type: true, points: true, choices: { select: { id: true, isCorrect: true } } },
    }),
    tx.answer.findMany({
      where: { attemptId },
      select: { questionId: true, choiceId: true, text: true, awardedPoints: true },
    }),
  ]);
  return gradeAnswers(questions, answers);
}

// outbox: يُعلَّم عند نجاح الدفع للطابور؛ الكنّاس يعيد المحاولة لو كان Redis متوقفاً
export async function queueParentNotification(attemptId: number): Promise<boolean> {
  const ok = await enqueue(
    'notifications',
    JOBS.parentExamResult,
    { attemptId },
    { jobId: `parent-result-${attemptId}` },
  );
  if (ok) {
    await prisma.examAttempt
      .updateMany({ where: { id: attemptId, parentNotifyQueuedAt: null }, data: { parentNotifyQueuedAt: new Date() } })
      .catch((err) => logger.warn({ err, attemptId }, 'تعذّر تعليم إشعار ولي الأمر'));
  }
  return ok;
}

// ── POST /api/attempts/:id/submit ────────────────────────────────
export async function submitAttempt(userId: number, attemptId: number): Promise<AttemptResultDTO> {
  const owned = await prisma.examAttempt.findFirst({ where: { id: attemptId, userId }, select: { id: true } });
  if (!owned) throw notFound('المحاولة غير موجودة');
  await finalizeAttempt(attemptId, 'submit'); // تسليم مكرر ← لا شيء (idempotent)
  return getResult(userId, attemptId);
}

// ── GET /api/attempts/:id/result ─────────────────────────────────
const resultExamSelect = {
  id: true,
  title: true,
  passScore: true,
  endAt: true,
  resultRelease: true,
  resultsReleasedAt: true,
} satisfies Prisma.ExamSelect;

export async function getResult(userId: number, attemptId: number): Promise<AttemptResultDTO> {
  let attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, userId },
    include: { exam: { select: resultExamSelect } },
  });
  if (!attempt) throw notFound('المحاولة غير موجودة');
  if (attempt.status === 'IN_PROGRESS') {
    if (!overdue(attempt.deadlineAt)) throw conflict('لم يتم تسليم الامتحان بعد');
    await finalizeAttempt(attemptId, 'timeout');
    attempt = await prisma.examAttempt.findFirstOrThrow({
      where: { id: attemptId, userId },
      include: { exam: { select: resultExamSelect } },
    });
  }

  const { exam } = attempt;
  const state = resultState(exam, attempt, EXAM_GRACE_SEC) ?? 'GRADING';
  const base: AttemptResultDTO = {
    attemptId: attempt.id,
    examId: exam.id,
    examTitle: exam.title,
    status: attempt.status,
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    resultRelease: exam.resultRelease,
    resultState: state,
    resultAvailableAt:
      exam.resultRelease === 'AFTER_END' && exam.endAt ? new Date(exam.endAt.getTime() + GRACE_MS).toISOString() : null,
    passScore: exam.passScore,
    score: null,
    totalPoints: null,
    percent: null,
    passed: null,
    stars: null,
    answeredCount: null,
    review: null,
  };
  // قبل الإعلان (أو أثناء التصحيح): لا درجة ولا مراجعة ولا isCorrect
  if (state !== 'VISIBLE') return base;

  const [questions, answers] = await Promise.all([
    prisma.question.findMany({
      where: { examId: exam.id },
      select: {
        id: true,
        type: true,
        text: true,
        imageUrl: true,
        points: true,
        modelAnswer: true,
        choices: { select: { id: true, text: true, isCorrect: true }, orderBy: [{ order: 'asc' }, { id: 'asc' }] },
      },
    }),
    prisma.answer.findMany({
      where: { attemptId },
      select: { questionId: true, choiceId: true, text: true, awardedPoints: true, feedback: true },
    }),
  ]);
  const graded = gradeAnswers(questions, answers);
  const byQ = new Map(answers.map((a) => [a.questionId, a]));
  const pos = new Map(attempt.questionOrder.map((id, i) => [id, i]));
  questions.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9) || a.id - b.id);

  const score = attempt.score ?? 0;
  const percent = scorePercent(score, attempt.totalPoints);
  return {
    ...base,
    score,
    totalPoints: attempt.totalPoints,
    percent,
    passed: percent >= exam.passScore,
    stars: examStars(percent, exam.passScore),
    answeredCount: graded.answeredCount,
    review: questions.map((q) => {
      const a = byQ.get(q.id);
      const manual = isManualQuestion(q.type);
      const earned = graded.earnedByQuestion.get(q.id) ?? 0;
      const selected = !manual && a?.choiceId != null && q.choices.some((c) => c.id === a.choiceId) ? a.choiceId : null;
      return {
        questionId: q.id,
        type: q.type,
        text: q.text,
        imageUrl: q.imageUrl,
        points: q.points,
        earned,
        correct: earned === q.points,
        choices: manual ? [] : q.choices,
        selectedChoiceId: selected,
        answerText: manual ? (a?.text ?? null) : null,
        feedback: manual ? (a?.feedback ?? null) : null,
        modelAnswer: manual ? q.modelAnswer : null,
      };
    }),
  };
}

// ── للكنّاس/الـ jobs ─────────────────────────────────────────────
export async function sweepOverdueAttempts(limit = 200): Promise<number> {
  const stale = await prisma.examAttempt.findMany({
    where: { status: 'IN_PROGRESS', deadlineAt: { lt: new Date(Date.now() - GRACE_MS) } },
    select: { id: true },
    orderBy: { deadlineAt: 'asc' },
    take: limit,
  });
  let closed = 0;
  for (const s of stale) {
    try {
      if ((await finalizeAttempt(s.id, 'timeout')).transitioned) closed++;
    } catch (err) {
      logger.error({ err, attemptId: s.id }, 'فشل إغلاق محاولة متأخرة');
    }
  }
  return closed;
}

// إشعارات ولي الأمر المستحقة ولم تصل للطابور: النتيجة مصحّحة وظاهرة للطالب
// (بعد انتهاء الامتحان، أو إعلان المس، أو Redis كان متوقفاً) — ما استجد خلال آخر 7 أيام
export async function flushParentOutbox(limit = 200, examId?: number): Promise<number> {
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const pending = await prisma.examAttempt.findMany({
    where: {
      ...(examId && { examId }),
      status: { in: ['SUBMITTED', 'EXPIRED'] },
      gradedAt: { not: null },
      parentNotifyQueuedAt: null,
      exam: {
        notifyParent: true,
        OR: [
          { resultRelease: 'IMMEDIATE' },
          { resultRelease: 'MANUAL', resultsReleasedAt: { not: null } },
          { resultRelease: 'AFTER_END', endAt: { lte: new Date(now.getTime() - GRACE_MS) } },
        ],
      },
      OR: [
        { gradedAt: { gt: since } },
        { exam: { resultsReleasedAt: { gt: since } } },
        { exam: { endAt: { gt: since } } },
      ],
    },
    select: { id: true },
    take: limit,
  });
  let queued = 0;
  for (const p of pending) if (await queueParentNotification(p.id)) queued++;
  return queued;
}

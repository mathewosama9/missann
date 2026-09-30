import type { Request } from 'express';
import type { AttemptStatus, Prisma } from '@prisma/client';
import {
  AFTER_END_NEEDS_END_MSG,
  EXAM_GRACE_SEC,
  isManualQuestion,
  scorePercent,
  type AdminAttemptDetailDTO,
  type AdminAttemptRowDTO,
  type AdminAttemptsFilter,
  type AdminExamDetailDTO,
  type AdminExamFilter,
  type AdminExamListItemDTO,
  type ExamAnalyticsDTO,
  type ExamCreateInput,
  type ExamUpdateInput,
  type GradeAttemptInput,
  type QuestionInput,
  type QuestionStatDTO,
} from '@miss-ann/shared';
import { LOCKED_TX, prisma } from '../../lib/prisma.js';
import { badRequest, conflict, notFound, paginate } from '../../lib/http.js';
import { auditTx } from '../../lib/audit.js';
import { hasText, isReleased } from './grading.js';
import { flushParentOutbox, gradeInTx, queueParentNotification } from './exams.service.js';

type Tx = Prisma.TransactionClient;

// ── إدارة الامتحانات (أدمن + مساعد) — كل كتابة في AuditLog ─────────
// قاعدة القفل: بعد أول محاولة لا تتغيّر بنية الأسئلة (نوع/نقاط/اختيارات/إجابة صحيحة/حذف/إضافة)
// حتى لا تتغيّر درجات من امتحنوا — يُسمح فقط بتصحيح النصوص والصور والإجابة النموذجية وإعادة الترتيب.
// ولا يتغيّر من يرى الامتحان (الكورس/الصف)، ولا ينتهي قبل موعد محاولة قائمة.

const locked = () => conflict('الامتحان له محاولات — لا يمكن تغيير الأسئلة، يمكن تعديل النصوص فقط');
const FINISHED: AttemptStatus[] = ['SUBMITTED', 'EXPIRED'];

// قفل صف الامتحان ثم عدّ المحاولات داخل نفس المعاملة: إنشاء محاولة يأخذ FOR KEY SHARE على صف
// الامتحان (المفتاح الأجنبي) فيتعارض مع FOR UPDATE ← لا محاولة تبدأ بين الفحص والكتابة.
async function lockExam(tx: Tx, examId: number): Promise<number> {
  const [row] = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "Exam" WHERE id = ${examId} FOR UPDATE`;
  if (!row) throw notFound('الامتحان غير موجود');
  return tx.examAttempt.count({ where: { examId } });
}

const listInclude = {
  course: { select: { title: true } },
  questions: { select: { points: true } },
  _count: { select: { attempts: true } },
} satisfies Prisma.ExamInclude;

type ExamRow = Prisma.ExamGetPayload<{ include: typeof listInclude }>;

function toListItem(e: ExamRow, pendingGrading: number): AdminExamListItemDTO {
  return {
    id: e.id,
    title: e.title,
    grade: e.grade,
    courseId: e.courseId,
    courseTitle: e.course?.title ?? null,
    durationMin: e.durationMin,
    startAt: e.startAt?.toISOString() ?? null,
    endAt: e.endAt?.toISOString() ?? null,
    isPublished: e.isPublished,
    shuffle: e.shuffle,
    resultRelease: e.resultRelease,
    resultsReleasedAt: e.resultsReleasedAt?.toISOString() ?? null,
    notifyParent: e.notifyParent,
    passScore: e.passScore,
    questionsCount: e.questions.length,
    totalPoints: e.questions.reduce((s, q) => s + q.points, 0),
    attemptsCount: e._count.attempts,
    pendingGrading,
    createdAt: e.createdAt.toISOString(),
  };
}

// محاولات سلّمت وتنتظر تصحيح المس — استعلام واحد لكل الصفحة
async function pendingGradingBy(examIds: number[]): Promise<Map<number, number>> {
  if (examIds.length === 0) return new Map();
  const groups = await prisma.examAttempt.groupBy({
    by: ['examId'],
    where: { examId: { in: examIds }, status: { in: FINISHED }, gradedAt: null },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.examId, g._count._all]));
}

export async function listExams(f: AdminExamFilter) {
  const where: Prisma.ExamWhereInput = {
    ...(f.grade && { grade: f.grade }),
    ...(f.courseId && { courseId: f.courseId }),
    ...(f.q && { title: { contains: f.q, mode: 'insensitive' } }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.exam.findMany({
      where,
      include: listInclude,
      orderBy: { createdAt: 'desc' },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
    prisma.exam.count({ where }),
  ]);
  const pending = await pendingGradingBy(rows.map((r) => r.id));
  return paginate(
    rows.map((r) => toListItem(r, pending.get(r.id) ?? 0)),
    total,
    f.page,
    f.pageSize,
  );
}

export async function getExam(id: number): Promise<AdminExamDetailDTO> {
  const e = await prisma.exam.findUnique({
    where: { id },
    include: {
      ...listInclude,
      questions: {
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        include: { choices: { orderBy: [{ order: 'asc' }, { id: 'asc' }] } },
      },
    },
  });
  if (!e) throw notFound('الامتحان غير موجود');
  const pending = await pendingGradingBy([id]);
  return {
    ...toListItem(e, pending.get(id) ?? 0),
    description: e.description,
    locked: e._count.attempts > 0,
    questions: e.questions.map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      imageUrl: q.imageUrl,
      points: q.points,
      order: q.order,
      modelAnswer: q.modelAnswer,
      choices: q.choices.map((c) => ({ id: c.id, text: c.text, isCorrect: c.isCorrect, order: c.order })),
    })),
  };
}

// امتحان الكورس يأخذ صف الكورس دائماً (لا تعارض بين الصف والكورس)
async function resolveGrade<T extends { courseId?: number | null; grade?: ExamCreateInput['grade'] }>(input: T): Promise<T> {
  if (!input.courseId) return input;
  const course = await prisma.course.findUnique({ where: { id: input.courseId }, select: { grade: true } });
  if (!course) throw badRequest('الكورس غير موجود', { courseId: 'الكورس غير موجود' });
  return { ...input, grade: course.grade };
}

export async function createExam(req: Request, input: ExamCreateInput): Promise<AdminExamDetailDTO> {
  if (input.isPublished) throw badRequest('أضف الأسئلة أولاً ثم انشر الامتحان', { isPublished: 'لا أسئلة بعد' });
  const data = await resolveGrade(input);
  const exam = await prisma.$transaction(async (tx) => {
    const e = await tx.exam.create({ data: { ...data, courseId: data.courseId ?? null } });
    await auditTx(tx, req, 'EXAM_CREATE', 'Exam', { examId: e.id, title: e.title });
    return e;
  });
  return getExam(exam.id);
}

export async function updateExam(req: Request, id: number, input: ExamUpdateInput): Promise<AdminExamDetailDTO> {
  const data = await resolveGrade(input);
  await prisma.$transaction(async (tx) => {
    const attempts = await lockExam(tx, id);
    const current = await tx.exam.findUniqueOrThrow({
      where: { id },
      select: {
        courseId: true,
        grade: true,
        startAt: true,
        endAt: true,
        resultRelease: true,
        _count: { select: { questions: true } },
      },
    });

    // التحقق بعد الدمج مع القيم الحالية (تعديل أحد الطرفين فقط)
    const startAt = data.startAt !== undefined ? data.startAt : current.startAt;
    const endAt = data.endAt !== undefined ? data.endAt : current.endAt;
    const release = data.resultRelease ?? current.resultRelease;
    if (startAt && endAt && endAt <= startAt) {
      throw badRequest('موعد النهاية يجب أن يكون بعد البداية', { endAt: 'بعد البداية' });
    }
    if (release === 'AFTER_END' && !endAt) {
      throw badRequest(AFTER_END_NEEDS_END_MSG, { resultRelease: AFTER_END_NEEDS_END_MSG });
    }
    if (data.isPublished && current._count.questions === 0) {
      throw badRequest('أضف سؤالاً واحداً على الأقل قبل النشر', { isPublished: 'لا أسئلة' });
    }

    if (attempts > 0) {
      // من امتحنوا يحتفظون بالوصول لنتائجهم، والامتحان لا ينتقل لطلاب آخرين بعد بدئه
      if (data.courseId !== undefined && (data.courseId ?? null) !== current.courseId) {
        throw conflict('لا يمكن تغيير كورس امتحان بدأه طلاب');
      }
      if (data.grade !== undefined && data.grade !== current.grade) {
        throw conflict('لا يمكن تغيير صف امتحان بدأه طلاب');
      }
      // النهاية لا تسبق موعد أي محاولة بدأت (وإلا تُعلن النتائج ومحاولات ما زالت جارية)
      if (data.endAt) {
        const { _max } = await tx.examAttempt.aggregate({ where: { examId: id }, _max: { deadlineAt: true } });
        if (_max.deadlineAt && data.endAt < _max.deadlineAt) {
          throw conflict('موعد النهاية لا يمكن أن يسبق موعد انتهاء محاولة بدأت بالفعل');
        }
      }
    }

    await tx.exam.update({ where: { id }, data });
    await auditTx(tx, req, 'EXAM_UPDATE', 'Exam', { examId: id, fields: Object.keys(input) });
  }, LOCKED_TX);
  return getExam(id);
}

export async function deleteExam(req: Request, id: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if ((await lockExam(tx, id)) > 0) throw conflict('لا يمكن حذف امتحان له محاولات — أخفِه بإلغاء النشر');
    const e = await tx.exam.delete({ where: { id }, select: { title: true } });
    await auditTx(tx, req, 'EXAM_DELETE', 'Exam', { examId: id, title: e.title });
  }, LOCKED_TX);
}

// إعلان النتائج (وضع «عندما أعلنها بنفسي») أو سحبها
export async function releaseResults(req: Request, id: number, released: boolean): Promise<AdminExamDetailDTO> {
  await prisma.$transaction(async (tx) => {
    const e = await tx.exam.findUnique({ where: { id }, select: { resultRelease: true } });
    if (!e) throw notFound('الامتحان غير موجود');
    if (e.resultRelease !== 'MANUAL') {
      throw badRequest('إعلان النتائج يدوياً متاح فقط عندما يكون الإعداد «عندما أعلنها بنفسي»');
    }
    await tx.exam.update({ where: { id }, data: { resultsReleasedAt: released ? new Date() : null } });
    await auditTx(tx, req, released ? 'EXAM_RESULTS_RELEASE' : 'EXAM_RESULTS_HIDE', 'Exam', { examId: id });
  });
  // إشعار أولياء الأمور بالنتائج المعلنة الآن (بدل انتظار الكنّاس)
  if (released) void flushParentOutbox(500, id);
  return getExam(id);
}

// ── الأسئلة ──────────────────────────────────────────────────────
const questionData = (input: QuestionInput) => ({
  type: input.type,
  text: input.text,
  imageUrl: input.imageUrl ?? null,
  points: input.points,
  modelAnswer: isManualQuestion(input.type) ? (input.modelAnswer ?? null) : null,
});

export async function addQuestion(req: Request, examId: number, input: QuestionInput): Promise<AdminExamDetailDTO> {
  if (input.choices.some((c) => c.id)) throw badRequest('اختيارات سؤال جديد بلا معرّفات');
  await prisma.$transaction(async (tx) => {
    if ((await lockExam(tx, examId)) > 0) throw locked();
    const last = await tx.question.aggregate({ where: { examId }, _max: { order: true } });
    const q = await tx.question.create({
      data: {
        examId,
        ...questionData(input),
        order: (last._max.order ?? -1) + 1,
        choices: { create: input.choices.map((c, i) => ({ text: c.text, isCorrect: c.isCorrect, order: i })) },
      },
    });
    await auditTx(tx, req, 'QUESTION_CREATE', 'Question', { examId, questionId: q.id });
  }, LOCKED_TX);
  return getExam(examId);
}

export async function updateQuestion(req: Request, id: number, input: QuestionInput): Promise<AdminExamDetailDTO> {
  const found = await prisma.question.findUnique({ where: { id }, select: { examId: true } });
  if (!found) throw notFound('السؤال غير موجود');

  await prisma.$transaction(async (tx) => {
    const attempts = await lockExam(tx, found.examId);
    const q = await tx.question.findUniqueOrThrow({ where: { id }, include: { choices: true } });
    const existingIds = new Set(q.choices.map((c) => c.id));
    if (input.choices.some((c) => c.id && !existingIds.has(c.id))) throw badRequest('اختيار لا ينتمي لهذا السؤال');

    if (attempts > 0) {
      // بعد المحاولات: نفس البنية بالضبط، والتغيير في النصوص/الصورة/الإجابة النموذجية فقط
      const sameShape =
        input.type === q.type &&
        input.points === q.points &&
        input.choices.length === q.choices.length &&
        input.choices.every((c) => c.id && q.choices.find((o) => o.id === c.id)?.isCorrect === c.isCorrect);
      if (!sameShape) throw locked();
    }

    await tx.question.update({ where: { id }, data: questionData(input) });
    const keep = input.choices.flatMap((c) => (c.id ? [c.id] : []));
    await tx.choice.deleteMany({ where: { questionId: id, id: { notIn: keep } } });
    for (const [i, c] of input.choices.entries()) {
      if (c.id) await tx.choice.update({ where: { id: c.id }, data: { text: c.text, isCorrect: c.isCorrect, order: i } });
      else await tx.choice.create({ data: { questionId: id, text: c.text, isCorrect: c.isCorrect, order: i } });
    }
    await auditTx(tx, req, 'QUESTION_UPDATE', 'Question', { examId: q.examId, questionId: id });
  }, LOCKED_TX);
  return getExam(found.examId);
}

export async function deleteQuestion(req: Request, id: number): Promise<AdminExamDetailDTO> {
  const q = await prisma.question.findUnique({ where: { id }, select: { examId: true } });
  if (!q) throw notFound('السؤال غير موجود');
  await prisma.$transaction(async (tx) => {
    if ((await lockExam(tx, q.examId)) > 0) throw locked();
    await tx.question.delete({ where: { id } });
    const left = await tx.question.count({ where: { examId: q.examId } });
    // امتحان منشور بلا أسئلة لا يُعرض على الطلاب أصلاً، لكن نخفيه صراحة
    if (left === 0) await tx.exam.update({ where: { id: q.examId }, data: { isPublished: false } });
    await auditTx(tx, req, 'QUESTION_DELETE', 'Question', { examId: q.examId, questionId: id });
  }, LOCKED_TX);
  return getExam(q.examId);
}

// إعادة الترتيب لا تمس التصحيح (ترتيب المحاولات القائمة محفوظ فيها) ← مسموحة دائماً
export async function reorderQuestions(
  req: Request,
  examId: number,
  items: { id: number; order: number }[],
): Promise<AdminExamDetailDTO> {
  await prisma.$transaction(async (tx) => {
    const owned = await tx.question.count({ where: { examId, id: { in: items.map((i) => i.id) } } });
    if (owned !== items.length) throw badRequest('أسئلة لا تنتمي لهذا الامتحان');
    for (const i of items) await tx.question.update({ where: { id: i.id }, data: { order: i.order } });
    await auditTx(tx, req, 'QUESTION_REORDER', 'Exam', { examId });
  });
  return getExam(examId);
}

// ── التحليلات (تجميع في SQL — لا تحميل كل المحاولات) ─────────────────
const BUCKETS = [
  { label: '0–49%', min: 0, max: 49 },
  { label: '50–64%', min: 50, max: 64 },
  { label: '65–74%', min: 65, max: 74 },
  { label: '75–89%', min: 75, max: 89 },
  { label: '90–100%', min: 90, max: 100 },
];

export async function examAnalytics(id: number): Promise<ExamAnalyticsDTO> {
  const exam = await prisma.exam.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      passScore: true,
      questions: {
        select: { id: true, type: true, text: true, points: true, order: true },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      },
    },
  });
  if (!exam) throw notFound('الامتحان غير موجود');

  // المحاولات المصحّحة بالكامل فقط تدخل الإحصاءات (المنتظرة لتصحيح المس درجتها جزئية)
  const [byPercent, perQuestion, inProgress, pendingGrading] = await Promise.all([
    prisma.$queryRaw<{ pct: number; c: number; s: number; hi: number; lo: number }[]>`
      SELECT pct::int AS pct, count(*)::int AS c, sum(score)::int AS s, max(score)::int AS hi, min(score)::int AS lo
      FROM (
        SELECT coalesce(score, 0) AS score,
               CASE WHEN "totalPoints" > 0 THEN round(coalesce(score, 0) * 100.0 / "totalPoints") ELSE 0 END AS pct
        FROM "ExamAttempt"
        WHERE "examId" = ${id} AND "gradedAt" IS NOT NULL AND status <> 'IN_PROGRESS'
      ) t
      GROUP BY pct`,
    prisma.$queryRaw<{ qid: number; answered: number; correct: number }[]>`
      SELECT an."questionId" AS qid,
             count(*)::int AS answered,
             count(*) FILTER (WHERE c."isCorrect" OR an."awardedPoints" = q.points)::int AS correct
      FROM "Answer" an
      JOIN "ExamAttempt" a ON a.id = an."attemptId"
      JOIN "Question" q ON q.id = an."questionId"
      LEFT JOIN "Choice" c ON c.id = an."choiceId"
      WHERE a."examId" = ${id} AND a."gradedAt" IS NOT NULL AND a.status <> 'IN_PROGRESS'
        AND (an."choiceId" IS NOT NULL OR btrim(coalesce(an.text, '')) <> '')
      GROUP BY an."questionId"`,
    prisma.examAttempt.count({ where: { examId: id, status: 'IN_PROGRESS' } }),
    prisma.examAttempt.count({ where: { examId: id, status: { in: FINISHED }, gradedAt: null } }),
  ]);

  const totalPoints = exam.questions.reduce((s, q) => s + q.points, 0);
  const n = byPercent.reduce((s, r) => s + r.c, 0);
  const sumScore = byPercent.reduce((s, r) => s + r.s, 0);
  const sumPct = byPercent.reduce((s, r) => s + r.pct * r.c, 0);
  const passed = byPercent.filter((r) => r.pct >= exam.passScore).reduce((s, r) => s + r.c, 0);
  const round1 = (x: number) => Math.round(x * 10) / 10;

  const stats = new Map(perQuestion.map((r) => [r.qid, r]));
  const questions: QuestionStatDTO[] = exam.questions.map((q, i) => {
    const st = stats.get(q.id);
    const correct = st?.correct ?? 0;
    return {
      questionId: q.id,
      order: i + 1,
      type: q.type,
      text: q.text,
      points: q.points,
      answered: st?.answered ?? 0,
      correct,
      // عدم الإجابة يُحسب خطأ
      errorRate: n > 0 ? Math.round(((n - correct) / n) * 100) : 0,
    };
  });
  const hardest =
    n > 0 ? questions.reduce<QuestionStatDTO | null>((h, q) => (!h || q.errorRate > h.errorRate ? q : h), null) : null;

  return {
    examId: exam.id,
    title: exam.title,
    totalPoints,
    passScore: exam.passScore,
    finished: n,
    pendingGrading,
    inProgress,
    average: n > 0 ? round1(sumScore / n) : null,
    averagePercent: n > 0 ? Math.round(sumPct / n) : null,
    highest: n > 0 ? Math.max(...byPercent.map((r) => r.hi)) : null,
    lowest: n > 0 ? Math.min(...byPercent.map((r) => r.lo)) : null,
    passed,
    passRate: n > 0 ? Math.round((passed / n) * 100) : null,
    distribution: BUCKETS.map((b) => ({
      label: b.label,
      count: byPercent.filter((r) => r.pct >= b.min && r.pct <= b.max).reduce((s, r) => s + r.c, 0),
    })),
    questions,
    hardest,
  };
}

export async function listAttempts(examId: number, f: AdminAttemptsFilter) {
  const where: Prisma.ExamAttemptWhereInput = {
    examId,
    ...(f.status && { status: f.status }),
    ...(f.grading === 'PENDING' && { status: { in: FINISHED }, gradedAt: null }),
    ...(f.grading === 'GRADED' && { gradedAt: { not: null } }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.examAttempt.findMany({
      where,
      include: { user: { select: { id: true, name: true, phone: true } } },
      orderBy: [{ score: { sort: 'desc', nulls: 'last' } }, { startedAt: 'asc' }],
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
    prisma.examAttempt.count({ where }),
  ]);
  const items: AdminAttemptRowDTO[] = rows.map((a) => ({
    id: a.id,
    user: a.user,
    status: a.status,
    score: a.score,
    totalPoints: a.totalPoints,
    percent: a.score === null ? null : scorePercent(a.score, a.totalPoints),
    needsGrading: a.status !== 'IN_PROGRESS' && a.gradedAt === null,
    gradedAt: a.gradedAt?.toISOString() ?? null,
    startedAt: a.startedAt.toISOString(),
    submittedAt: a.submittedAt?.toISOString() ?? null,
  }));
  return paginate(items, total, f.page, f.pageSize);
}

// ── تصحيح المس للأسئلة الكتابية ─────────────────────────────────────
export async function getAttemptForGrading(attemptId: number): Promise<AdminAttemptDetailDTO> {
  const a = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    include: {
      user: { select: { id: true, name: true, phone: true } },
      exam: { select: { id: true, title: true, passScore: true } },
      answers: { select: { questionId: true, choiceId: true, text: true, awardedPoints: true, feedback: true } },
    },
  });
  if (!a) throw notFound('المحاولة غير موجودة');
  const questions = await prisma.question.findMany({
    where: { examId: a.examId },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
    include: { choices: { orderBy: [{ order: 'asc' }, { id: 'asc' }] } },
  });
  const byQ = new Map(a.answers.map((x) => [x.questionId, x]));
  let pendingCount = 0;

  const items = questions.map((q, i) => {
    const ans = byQ.get(q.id);
    const manual = isManualQuestion(q.type);
    let earned = 0;
    if (manual) {
      if (hasText(ans?.text) && ans.awardedPoints === null) pendingCount++;
      earned = ans?.awardedPoints ?? 0;
    } else if (ans?.choiceId && q.choices.some((c) => c.id === ans.choiceId && c.isCorrect)) {
      earned = q.points;
    }
    return {
      questionId: q.id,
      order: i + 1,
      type: q.type,
      text: q.text,
      imageUrl: q.imageUrl,
      points: q.points,
      manual,
      choices: manual ? [] : q.choices.map((c) => ({ id: c.id, text: c.text, isCorrect: c.isCorrect, order: c.order })),
      selectedChoiceId: manual ? null : (ans?.choiceId ?? null),
      modelAnswer: manual ? q.modelAnswer : null,
      answerText: manual ? (ans?.text ?? null) : null,
      awardedPoints: manual ? (ans?.awardedPoints ?? null) : null,
      feedback: manual ? (ans?.feedback ?? null) : null,
      earned,
    };
  });

  return {
    id: a.id,
    examId: a.exam.id,
    examTitle: a.exam.title,
    user: a.user,
    status: a.status,
    score: a.score,
    totalPoints: a.totalPoints,
    passScore: a.exam.passScore,
    startedAt: a.startedAt.toISOString(),
    submittedAt: a.submittedAt?.toISOString() ?? null,
    gradedAt: a.gradedAt?.toISOString() ?? null,
    pendingCount: a.status === 'IN_PROGRESS' ? 0 : pendingCount,
    items,
  };
}

// يصحّح (أو يعدّل تصحيح) أسئلة كتابية في محاولة منتهية؛ تكتمل المحاولة عند تصحيح آخر إجابة كتابية
export async function gradeAttempt(req: Request, attemptId: number, input: GradeAttemptInput): Promise<AdminAttemptDetailDTO> {
  const result = await prisma.$transaction(async (tx) => {
    // نفس قفل التسليم ← لا تصحيح متزامن مع الإغلاق أو مع مصحّح آخر
    const [row] = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "ExamAttempt" WHERE id = ${attemptId} FOR UPDATE`;
    if (!row) throw notFound('المحاولة غير موجودة');
    const attempt = await tx.examAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      select: {
        status: true,
        examId: true,
        gradedAt: true,
        exam: { select: { notifyParent: true, resultRelease: true, resultsReleasedAt: true, endAt: true } },
      },
    });
    if (attempt.status === 'IN_PROGRESS') throw conflict('الطالب لم يسلّم الامتحان بعد');

    const questions = await tx.question.findMany({
      where: { examId: attempt.examId, id: { in: input.grades.map((g) => g.questionId) } },
      select: { id: true, type: true, points: true },
    });
    const qById = new Map(questions.map((q) => [q.id, q]));
    const answers = await tx.answer.findMany({
      where: { attemptId, questionId: { in: input.grades.map((g) => g.questionId) } },
      select: { id: true, questionId: true, text: true },
    });
    const aByQ = new Map(answers.map((a) => [a.questionId, a]));

    const now = new Date();
    for (const g of input.grades) {
      const q = qById.get(g.questionId);
      if (!q || !isManualQuestion(q.type)) throw badRequest('يمكن تصحيح الأسئلة الكتابية فقط');
      if (g.points > q.points) throw badRequest(`الدرجة أكبر من درجة السؤال (${q.points})`);
      const a = aByQ.get(g.questionId);
      if (!a || !hasText(a.text)) throw badRequest('الطالب لم يجب عن هذا السؤال (درجته صفر تلقائياً)');
      await tx.answer.update({
        where: { id: a.id },
        data: { awardedPoints: g.points, feedback: g.feedback?.trim() || null, gradedAt: now },
      });
    }

    const graded = await gradeInTx(tx, attemptId, attempt.examId);
    const gradedAt = graded.pendingManual === 0 ? (attempt.gradedAt ?? now) : null;
    await tx.examAttempt.update({
      where: { id: attemptId },
      data: { score: graded.score, totalPoints: graded.totalPoints, gradedAt },
    });
    await auditTx(tx, req, attempt.gradedAt ? 'ATTEMPT_REGRADE' : 'ATTEMPT_GRADE', 'ExamAttempt', {
      attemptId,
      examId: attempt.examId,
      questions: input.grades.length,
      score: graded.score,
      complete: gradedAt !== null,
    });
    const completedNow = attempt.gradedAt === null && gradedAt !== null;
    return {
      notify: completedNow && attempt.exam.notifyParent && isReleased(attempt.exam, EXAM_GRACE_SEC, now),
    };
  }, LOCKED_TX);

  if (result.notify) void queueParentNotification(attemptId);
  return getAttemptForGrading(attemptId);
}

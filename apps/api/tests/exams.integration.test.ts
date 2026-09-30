// اختبارات تكامل الامتحانات على قاعدة البيانات الحقيقية (DATABASE_URL + Redis من .env):
// التصحيح، عدم كشف isCorrect، IDOR، الوقت/EXPIRED، التسليم المكرر، طابور إشعار ولي الأمر،
// تحقق الأدمن والتحليلات. كل البيانات بأرقام 0155598xxxx وكورسات TEST-P5 وتُحذف في النهاية.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import type supertestType from 'supertest';
import type { Queue } from 'bullmq';

const PHONE_PREFIX = '0155598';

let app: Express;
let prisma: PrismaClient;
let request: typeof supertestType;
let sign: (p: { sub: number; role: 'STUDENT' | 'ADMIN' | 'ASSISTANT'; name: string }) => string;
let notifications: Queue;
let examsQueue: Queue;
let closeQueues: () => Promise<void>;
let sweepOverdueAttempts: () => Promise<number>;

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const students: { id: number; token: string }[] = [];
let adminToken = '';
let assistantToken = '';
let courseId = 0;
const attemptIds: number[] = [];

async function cleanup() {
  const users = await prisma.user.findMany({ where: { phone: { startsWith: PHONE_PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.exam.deleteMany({ where: { title: { startsWith: 'TEST-P5' } } });
  await prisma.course.deleteMany({ where: { title: { startsWith: 'TEST-P5' } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

// ينتظر شرطاً غير متزامن (الإشعار يُدفع بعد الرد بلا انتظار)
async function eventually<T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 5000): Promise<T> {
  const t0 = Date.now();
  let v = await fn();
  while (!ok(v) && Date.now() - t0 < ms) {
    await new Promise((r) => setTimeout(r, 100));
    v = await fn();
  }
  return v;
}

beforeAll(async () => {
  await import('dotenv/config');
  ({ prisma } = await import('../src/lib/prisma.js'));
  const { createApp } = await import('../src/app.js');
  ({ signAccessToken: sign } = (await import('../src/lib/tokens.js')) as never);
  const q = await import('../src/lib/queue.js');
  notifications = q.getQueue('notifications');
  examsQueue = q.getQueue('exams');
  closeQueues = q.closeQueues;
  ({ sweepOverdueAttempts } = await import('../src/modules/exams/exams.service.js'));
  request = (await import('supertest')).default;
  app = createApp();

  await cleanup();
  for (let i = 1; i <= 3; i++) {
    const u = await prisma.user.create({
      data: {
        name: `طالب امتحان ${i}`,
        phone: `${PHONE_PREFIX}${String(i).padStart(4, '0')}`,
        parentPhone: '01000000002',
        passwordHash: 'x',
        isActive: true,
        grade: 'FOURTH_PRIMARY',
      },
    });
    students.push({ id: u.id, token: sign({ sub: u.id, role: 'STUDENT', name: u.name }) });
  }
  const admin = await prisma.user.create({
    data: { name: 'أدمن امتحانات', phone: `${PHONE_PREFIX}0099`, parentPhone: '01000000002', passwordHash: 'x', isActive: true, role: 'ADMIN' },
  });
  adminToken = sign({ sub: admin.id, role: 'ADMIN', name: admin.name });
  const assistant = await prisma.user.create({
    data: { name: 'مساعد', phone: `${PHONE_PREFIX}0098`, parentPhone: '01000000002', passwordHash: 'x', isActive: true, role: 'ASSISTANT' },
  });
  assistantToken = sign({ sub: assistant.id, role: 'ASSISTANT', name: assistant.name });
  courseId = (
    await prisma.course.create({
      data: { title: 'TEST-P5 كورس', description: 'اختبار', grade: 'FIFTH_PRIMARY', type: 'MONTHLY', price: 1000, isPublished: true },
    })
  ).id;
}, 30_000);

// job قيد التنفيذ لدى عامل خادم التطوير لا يُزال (مقفول) ← نعيد المحاولة حتى ينتهي ثم نزيله
async function removeWhenIdle(queue: Queue, id: string): Promise<void> {
  await eventually(
    async () => {
      const j = await queue.getJob(id);
      if (!j) return true;
      await j.remove().catch(() => undefined);
      return !(await queue.getJob(id));
    },
    (gone) => gone,
  );
}

// رسائل صادرة لمستخدمي الاختبار أنشأها عامل خادم التطوير (قد يُنشئ المزيد أثناء التنظيف) ←
// جولات حتى لا يظهر جديد، وكل job يُزال بعد تسليم رسالته وانتهاء تنفيذه
async function removeTestMessages(): Promise<void> {
  const messages = (await import('../src/lib/queue.js')).getQueue('messages');
  const seen = new Set<number>();
  for (let round = 0; round < 10; round++) {
    const rows = await prisma.notification.findMany({
      where: { user: { phone: { startsWith: PHONE_PREFIX } }, channel: { not: 'IN_APP' }, id: { notIn: [...seen] } },
      select: { id: true },
    });
    if (rows.length === 0 && round > 0) return;
    // الصف يظهر قبل دفع الـ job ← ننتظر معالجته (خروجه من PENDING) ثم نزيل الـ job
    const ids = rows.map((r) => r.id);
    await eventually(() => prisma.notification.count({ where: { id: { in: ids }, status: 'PENDING' } }), (n) => n === 0);
    for (const id of ids) {
      seen.add(id);
      await removeWhenIdle(messages, `msg-${id}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

afterAll(async () => {
  // إزالة jobs الاختبار من Redis: إشعارات ولي الأمر أولاً (بعد انتهاء أي تنفيذ جارٍ)، ثم تسليم
  // الرسائل التي أنشأتها — فلا تُنشأ رسالة بعد الاستعلام عنها
  for (const id of attemptIds) {
    await removeWhenIdle(notifications, `parent-result-${id}`);
    await (await examsQueue.getJob(`close-attempt-${id}`))?.remove().catch(() => undefined);
  }
  await removeTestMessages();
  await cleanup();
  await closeQueues();
  await prisma.$disconnect();
});

// ── أدوات بناء امتحان عبر API الأدمن ──────────────────────────────
const mcq = (text: string, points: number, correctIdx: number, n = 3) => ({
  type: 'MCQ',
  text,
  points,
  choices: Array.from({ length: n }, (_, i) => ({ text: `${text} — اختيار ${i + 1}`, isCorrect: i === correctIdx })),
});
const tf = (text: string, points: number, trueIsCorrect: boolean) => ({
  type: 'TRUEFALSE',
  text,
  points,
  choices: [
    { text: 'صح', isCorrect: trueIsCorrect },
    { text: 'خطأ', isCorrect: !trueIsCorrect },
  ],
});

async function buildExam(extra: Record<string, unknown> = {}, questions = [mcq('س1', 2, 0), mcq('س2', 3, 1), tf('س3', 5, true)]) {
  const created = await request(app)
    .post('/api/admin/exams')
    .set(auth(adminToken))
    .send({ title: `TEST-P5 ${Math.random().toString(36).slice(2, 7)}`, grade: 'FOURTH_PRIMARY', durationMin: 20, resultRelease: 'IMMEDIATE', ...extra, isPublished: false });
  expect(created.status).toBe(201);
  const id = created.body.exam.id as number;
  for (const q of questions) {
    const r = await request(app).post(`/api/admin/exams/${id}/questions`).set(auth(adminToken)).send(q);
    expect(r.status).toBe(201);
  }
  const pub = await request(app).patch(`/api/admin/exams/${id}`).set(auth(adminToken)).send({ isPublished: true });
  expect(pub.status).toBe(200);
  return pub.body.exam as {
    id: number;
    questions: { id: number; points: number; choices: { id: number; isCorrect: boolean }[] }[];
  };
}

const correctOf = (q: { choices: { id: number; isCorrect: boolean }[] }) => q.choices.find((c) => c.isCorrect)!.id;
const wrongOf = (q: { choices: { id: number; isCorrect: boolean }[] }) => q.choices.find((c) => !c.isCorrect)!.id;

// ── الأدمن: التحقق والصلاحيات ─────────────────────────────────────
describe('admin exam builder', () => {
  it('يرفض MCQ بإجابتين صحيحتين، صح/خطأ بثلاثة اختيارات، واختياراً واحداً', async () => {
    const exam = await request(app).post('/api/admin/exams').set(auth(adminToken)).send({ title: 'TEST-P5 تحقق', grade: 'FOURTH_PRIMARY', durationMin: 10 });
    expect(exam.status).toBe(201);
    const id = exam.body.exam.id;
    const post = (q: unknown) => request(app).post(`/api/admin/exams/${id}/questions`).set(auth(adminToken)).send(q);

    const twoCorrect = await post({ ...mcq('x', 1, 0), choices: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: true }] });
    expect(twoCorrect.status).toBe(400);
    expect(twoCorrect.body.fields.choices).toContain('واحدة بالضبط');
    const noCorrect = await post({ ...mcq('x', 1, 0), choices: [{ text: 'a', isCorrect: false }, { text: 'b', isCorrect: false }] });
    expect(noCorrect.status).toBe(400);
    const tf3 = await post({ ...tf('x', 1, true), choices: [{ text: 'صح', isCorrect: true }, { text: 'خطأ', isCorrect: false }, { text: 'ربما', isCorrect: false }] });
    expect(tf3.status).toBe(400);
    expect(tf3.body.fields.choices).toContain('اختياران فقط');
    expect((await post({ ...mcq('x', 1, 0, 1) })).status).toBe(400);
    expect((await post({ ...mcq('x', 1, 0), imageUrl: 'javascript:alert(1)' })).status).toBe(400);

    // لا نشر بلا أسئلة
    const pub = await request(app).patch(`/api/admin/exams/${id}`).set(auth(adminToken)).send({ isPublished: true });
    expect(pub.status).toBe(400);
    // نافذة مقلوبة
    const bad = await request(app).patch(`/api/admin/exams/${id}`).set(auth(adminToken)).send({ startAt: '2026-10-02T10:00:00Z', endAt: '2026-10-01T10:00:00Z' });
    expect(bad.status).toBe(400);
  });

  it('الطالب ممنوع (403) والمساعد مسموح على مسارات الامتحانات؛ الكتابة في AuditLog', async () => {
    expect((await request(app).get('/api/admin/exams').set(auth(students[0]!.token))).status).toBe(403);
    expect((await request(app).post('/api/admin/exams').set(auth(students[0]!.token)).send({})).status).toBe(403);
    expect((await request(app).get('/api/admin/exams').set(auth(assistantToken))).status).toBe(200);
    // المساعد ما زال يصل لمسارات المحتوى، ولا يصل للمالية
    expect((await request(app).get('/api/admin/courses').set(auth(assistantToken))).status).toBe(200);
    expect((await request(app).get('/api/admin/payments').set(auth(assistantToken))).status).toBe(403);
    expect(await prisma.auditLog.count({ where: { action: { in: ['EXAM_CREATE', 'EXAM_UPDATE'] }, createdAt: { gte: new Date(Date.now() - 60_000) } } })).toBeGreaterThan(0);
  });

  it('امتحان الكورس يأخذ صف الكورس تلقائياً', async () => {
    const r = await request(app).post('/api/admin/exams').set(auth(adminToken)).send({ title: 'TEST-P5 كورس', grade: 'FOURTH_PRIMARY', durationMin: 10, courseId });
    expect(r.status).toBe(201);
    expect(r.body.exam.grade).toBe('FIFTH_PRIMARY');
  });
});

// ── رحلة الطالب ──────────────────────────────────────────────────
describe('student exam flow', () => {
  let exam: Awaited<ReturnType<typeof buildExam>>;
  let attemptA = 0;

  beforeAll(async () => {
    exam = await buildExam({ notifyParent: true, shuffle: true });
  });

  it('القائمة والتفاصيل تُظهر الامتحان OPEN بلا isCorrect', async () => {
    const list = await request(app).get('/api/exams').set(auth(students[0]!.token));
    expect(list.status).toBe(200);
    const item = list.body.items.find((e: { id: number }) => e.id === exam.id);
    expect(item).toMatchObject({ state: 'OPEN', questionsCount: 3, totalPoints: 10, attempt: null });
    const detail = await request(app).get(`/api/exams/${exam.id}`).set(auth(students[0]!.token));
    expect(detail.status).toBe(200);
    expect(JSON.stringify(list.body) + JSON.stringify(detail.body)).not.toContain('isCorrect');
  });

  it('البدء يرجع الأسئلة بلا isCorrect + موعد الخادم؛ البدء ثانيةً يستأنف نفس المحاولة', async () => {
    const t0 = Date.now();
    const s = await request(app).post(`/api/exams/${exam.id}/start`).set(auth(students[0]!.token));
    expect(s.status).toBe(200);
    attemptA = s.body.attemptId;
    attemptIds.push(attemptA);
    expect(JSON.stringify(s.body)).not.toMatch(/isCorrect/);
    expect(s.body.questions).toHaveLength(3);
    expect(s.body.questions.map((q: { id: number }) => q.id).sort()).toEqual(exam.questions.map((q) => q.id).sort());
    const deadline = Date.parse(s.body.deadlineAt);
    expect(Math.abs(deadline - (t0 + 20 * 60_000))).toBeLessThan(5_000);

    const again = await request(app).post(`/api/exams/${exam.id}/start`).set(auth(students[0]!.token));
    expect(again.body.attemptId).toBe(attemptA);
    expect(again.body.deadlineAt).toBe(s.body.deadlineAt);
    // الترتيب المخلوط ثابت عند الاستئناف
    expect(again.body.questions.map((q: { id: number }) => q.id)).toEqual(s.body.questions.map((q: { id: number }) => q.id));
    expect(await prisma.examAttempt.count({ where: { examId: exam.id, userId: students[0]!.id } })).toBe(1);
    // job الإغلاق المؤجّل
    const job = await eventually(() => examsQueue.getJob(`close-attempt-${attemptA}`), (j) => !!j);
    expect(job?.opts.delay).toBeGreaterThan(19 * 60_000);
  });

  it('بدء متزامن من طالب آخر ×3 ← محاولة واحدة', async () => {
    const rs = await Promise.all([1, 2, 3].map(() => request(app).post(`/api/exams/${exam.id}/start`).set(auth(students[2]!.token))));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(new Set(rs.map((r) => r.body.attemptId)).size).toBe(1);
    attemptIds.push(rs[0]!.body.attemptId);
  });

  it('الحفظ التلقائي: اختيار من سؤال آخر مرفوض، والتعديل upsert', async () => {
    const [q1, q2] = exam.questions;
    const save = (questionId: number, choiceId: number, token = students[0]!.token) =>
      request(app).patch(`/api/attempts/${attemptA}/answer`).set(auth(token)).send({ questionId, choiceId });

    expect((await save(q1!.id, correctOf(q2!))).status).toBe(400);
    const first = await save(q1!.id, wrongOf(q1!));
    expect(first.status).toBe(200);
    expect(Math.abs(Date.parse(first.body.savedAt) - Date.now())).toBeLessThan(10_000);
    const changed = await save(q1!.id, correctOf(q1!));
    expect(changed.status).toBe(200);
    expect((await save(q2!.id, wrongOf(q2!))).status).toBe(200);
    // upsert: سطر واحد لكل سؤال، والاختيار الأحدث هو المحفوظ
    const rows = await prisma.answer.findMany({ where: { attemptId: attemptA } });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.questionId === q1!.id)?.choiceId).toBe(correctOf(q1!));
    // نص على سؤال موضوعي، أو اختيار ونص معاً ← 400
    const raw = (body: object) => request(app).patch(`/api/attempts/${attemptA}/answer`).set(auth(students[0]!.token)).send(body);
    expect((await raw({ questionId: q1!.id, text: 'x' })).status).toBe(400);
    expect((await raw({ questionId: q1!.id, choiceId: correctOf(q1!), text: 'x' })).status).toBe(400);
    // معرّفات خارج نطاق INT4 ← 400 لا 500
    expect((await raw({ questionId: 3_000_000_000, choiceId: 1 })).status).toBe(400);
    expect((await request(app).get('/api/attempts/3000000000/result').set(auth(students[0]!.token))).status).toBe(400);
    expect((await request(app).get('/api/exams/3000000000').set(auth(students[0]!.token))).status).toBe(400);
    // س3 بلا إجابة
  });

  it('IDOR: طالب آخر لا يقرأ ولا يجيب ولا يسلّم محاولة غيره (404)', async () => {
    const other = students[1]!.token;
    const q1 = exam.questions[0]!;
    expect((await request(app).patch(`/api/attempts/${attemptA}/answer`).set(auth(other)).send({ questionId: q1.id, choiceId: correctOf(q1) })).status).toBe(404);
    expect((await request(app).post(`/api/attempts/${attemptA}/submit`).set(auth(other))).status).toBe(404);
    expect((await request(app).get(`/api/attempts/${attemptA}/result`).set(auth(other))).status).toBe(404);
    // الأدمن لا يستخدم مسارات الطالب
    expect((await request(app).get(`/api/attempts/${attemptA}/result`).set(auth(adminToken))).status).toBe(403);
    // النتيجة قبل التسليم
    expect((await request(app).get(`/api/attempts/${attemptA}/result`).set(auth(students[0]!.token))).status).toBe(409);
  });

  it('التسليم: تصحيح الخادم (2 من 10) + تسليم متزامن ×3 idempotent + إشعار ولي الأمر مرة واحدة', async () => {
    const rs = await Promise.all([1, 2, 3].map(() => request(app).post(`/api/attempts/${attemptA}/submit`).set(auth(students[0]!.token))));
    for (const r of rs) {
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ status: 'SUBMITTED', score: 2, totalPoints: 10, percent: 20, passed: false, stars: 0, answeredCount: 2 });
    }
    const row = await prisma.examAttempt.findUniqueOrThrow({ where: { id: attemptA } });
    expect(row).toMatchObject({ status: 'SUBMITTED', score: 2, totalPoints: 10 });
    const submittedAt = row.submittedAt!.getTime();

    // المراجعة مسموحة الآن (لا endAt) ← isCorrect يظهر في النتيجة فقط
    const result = await request(app).get(`/api/attempts/${attemptA}/result`).set(auth(students[0]!.token));
    expect(result.body.review).toHaveLength(3);
    const byId = new Map(result.body.review.map((r: { questionId: number }) => [r.questionId, r]));
    expect(byId.get(exam.questions[0]!.id)).toMatchObject({ correct: true, selectedChoiceId: correctOf(exam.questions[0]!) });
    expect(byId.get(exam.questions[1]!.id)).toMatchObject({ correct: false });
    expect(byId.get(exam.questions[2]!.id)).toMatchObject({ correct: false, selectedChoiceId: null });

    // إشعار ولي الأمر في الطابور (غير متزامن) ومُعلَّم في outbox
    const marked = await eventually(
      () => prisma.examAttempt.findUniqueOrThrow({ where: { id: attemptA } }),
      (a) => a.parentNotifyQueuedAt !== null,
    );
    expect(marked.parentNotifyQueuedAt).not.toBeNull();
    const job = await notifications.getJob(`parent-result-${attemptA}`);
    expect(job?.name).toBe('parent-exam-result');
    expect(job?.data).toEqual({ attemptId: attemptA });
    const jobs = await notifications.getJobs(['waiting', 'delayed', 'active', 'completed', 'failed']);
    expect(jobs.filter((j) => j?.data?.attemptId === attemptA)).toHaveLength(1);

    // تسليم لاحق لا يعيد التصحيح
    const later = await request(app).post(`/api/attempts/${attemptA}/submit`).set(auth(students[0]!.token));
    expect(later.body.score).toBe(2);
    expect((await prisma.examAttempt.findUniqueOrThrow({ where: { id: attemptA } })).submittedAt!.getTime()).toBe(submittedAt);
  });

  it('لا حفظ بعد التسليم، ولا بدء جديد (409)', async () => {
    const q3 = exam.questions[2]!;
    const r = await request(app).patch(`/api/attempts/${attemptA}/answer`).set(auth(students[0]!.token)).send({ questionId: q3.id, choiceId: correctOf(q3) });
    expect(r.status).toBe(409);
    const s = await request(app).post(`/api/exams/${exam.id}/start`).set(auth(students[0]!.token));
    expect(s.status).toBe(409);
    expect(s.body.code).toBe('EXAM_FINISHED');
    const list = await request(app).get('/api/exams').set(auth(students[0]!.token));
    expect(list.body.items.find((e: { id: number }) => e.id === exam.id)).toMatchObject({ state: 'FINISHED', attempt: { score: 2 } });
  });

  it('بعد الوقت: الحفظ مرفوض، والتسليم EXPIRED بتصحيح ما حُفظ فقط', async () => {
    const s = students[1]!;
    const start = await request(app).post(`/api/exams/${exam.id}/start`).set(auth(s.token));
    const id = start.body.attemptId as number;
    attemptIds.push(id);
    const q3 = exam.questions[2]!;
    expect((await request(app).patch(`/api/attempts/${id}/answer`).set(auth(s.token)).send({ questionId: q3.id, choiceId: correctOf(q3) })).status).toBe(200);

    // الموعد مضى منذ دقيقة
    await prisma.examAttempt.update({ where: { id }, data: { deadlineAt: new Date(Date.now() - 60_000) } });
    const q1 = exam.questions[0]!;
    const late = await request(app).patch(`/api/attempts/${id}/answer`).set(auth(s.token)).send({ questionId: q1.id, choiceId: correctOf(q1) });
    expect(late.status).toBe(409);

    const sub = await request(app).post(`/api/attempts/${id}/submit`).set(auth(s.token));
    expect(sub.status).toBe(200);
    expect(sub.body).toMatchObject({ status: 'EXPIRED', score: 5, totalPoints: 10, answeredCount: 1 });
  });

  it('الكنّاس يغلق محاولة معلّقة بعد موعدها (EXPIRED)', async () => {
    const s = students[2]!; // بدأ في اختبار التزامن ولم يسلّم
    const a = await prisma.examAttempt.findUniqueOrThrow({ where: { examId_userId: { examId: exam.id, userId: s.id } } });
    await prisma.examAttempt.update({ where: { id: a.id }, data: { deadlineAt: new Date(Date.now() - 60_000) } });
    await sweepOverdueAttempts();
    const after = await prisma.examAttempt.findUniqueOrThrow({ where: { id: a.id } });
    expect(after).toMatchObject({ status: 'EXPIRED', score: 0 });
    expect(after.submittedAt).not.toBeNull();
  });

  it('التحليلات: متوسط/أعلى/أقل/نسبة نجاح/أصعب سؤال', async () => {
    const r = await request(app).get(`/api/admin/exams/${exam.id}/analytics`).set(auth(adminToken));
    expect(r.status).toBe(200);
    // الدرجات: 2، 5، 0 من 10
    expect(r.body).toMatchObject({ finished: 3, inProgress: 0, average: 2.3, highest: 5, lowest: 0, passed: 1, passRate: 33, totalPoints: 10 });
    // س2: لم يُجب أحد صحيحاً (خطأ 100%) — والأول بالترتيب عند التعادل مع غيره
    const q2 = r.body.questions.find((q: { questionId: number }) => q.questionId === exam.questions[1]!.id);
    expect(q2).toMatchObject({ correct: 0, errorRate: 100 });
    expect(r.body.hardest.errorRate).toBe(100);
    expect(r.body.distribution.reduce((s: number, b: { count: number }) => s + b.count, 0)).toBe(3);

    const attempts = await request(app).get(`/api/admin/exams/${exam.id}/attempts`).set(auth(adminToken));
    expect(attempts.body.items.map((a: { score: number }) => a.score)).toEqual([5, 2, 0]);
  });

  it('بعد المحاولات: الأسئلة مقفولة هيكلياً، النصوص قابلة للتعديل، ولا حذف للامتحان', async () => {
    const detail = await request(app).get(`/api/admin/exams/${exam.id}`).set(auth(adminToken));
    expect(detail.body.exam.locked).toBe(true);
    const q = detail.body.exam.questions[0];
    const base = { type: q.type, text: q.text, points: q.points, choices: q.choices.map((c: { id: number; text: string; isCorrect: boolean }) => ({ id: c.id, text: c.text, isCorrect: c.isCorrect })) };

    const flip = { ...base, choices: base.choices.map((c: { isCorrect: boolean }) => ({ ...c, isCorrect: !c.isCorrect })) };
    flip.choices = flip.choices.map((c: { isCorrect: boolean }, i: number) => ({ ...c, isCorrect: i === 1 }));
    expect((await request(app).patch(`/api/admin/questions/${q.id}`).set(auth(adminToken)).send(flip)).status).toBe(409);
    expect((await request(app).patch(`/api/admin/questions/${q.id}`).set(auth(adminToken)).send({ ...base, points: 9 })).status).toBe(409);
    const typo = await request(app).patch(`/api/admin/questions/${q.id}`).set(auth(adminToken)).send({ ...base, text: 'س1 (مصحّح)' });
    expect(typo.status).toBe(200);
    expect((await request(app).post(`/api/admin/exams/${exam.id}/questions`).set(auth(adminToken)).send(mcq('جديد', 1, 0))).status).toBe(409);
    expect((await request(app).delete(`/api/admin/questions/${q.id}`).set(auth(adminToken))).status).toBe(409);
    expect((await request(app).delete(`/api/admin/exams/${exam.id}`).set(auth(adminToken))).status).toBe(409);
    // درجة المحاولة لم تتغيّر
    expect((await prisma.examAttempt.findUniqueOrThrow({ where: { id: attemptA } })).score).toBe(2);
  });
});

// ── الإعدادات: الإشعار، إخفاء النتيجة، النافذة، الوصول للكورس ─────────
describe('exam settings', () => {
  it('notifyParent=false ← لا job إشعار', async () => {
    const exam = await buildExam({ notifyParent: false }, [tf('س', 1, true)]);
    const s = students[0]!;
    const st = await request(app).post(`/api/exams/${exam.id}/start`).set(auth(s.token));
    attemptIds.push(st.body.attemptId);
    await request(app).post(`/api/attempts/${st.body.attemptId}/submit`).set(auth(s.token));
    await new Promise((r) => setTimeout(r, 500));
    expect(await notifications.getJob(`parent-result-${st.body.attemptId}`)).toBeFalsy();
    expect((await prisma.examAttempt.findUniqueOrThrow({ where: { id: st.body.attemptId } })).parentNotifyQueuedAt).toBeNull();
  });

  it('MANUAL ← لا درجة ولا مراجعة حتى تعلنها المس، ثم تظهر ويُشعَر ولي الأمر', async () => {
    const exam = await buildExam({ resultRelease: 'MANUAL', notifyParent: true }, [tf('س', 1, true)]);
    const s = students[0]!;
    const st = await request(app).post(`/api/exams/${exam.id}/start`).set(auth(s.token));
    const aid = st.body.attemptId as number;
    attemptIds.push(aid);
    await request(app).patch(`/api/attempts/${aid}/answer`).set(auth(s.token)).send({ questionId: exam.questions[0]!.id, choiceId: correctOf(exam.questions[0]!) });
    const sub = await request(app).post(`/api/attempts/${aid}/submit`).set(auth(s.token));
    expect(sub.body).toMatchObject({ status: 'SUBMITTED', resultRelease: 'MANUAL', resultState: 'WAITING', score: null, review: null });
    expect(JSON.stringify(sub.body)).not.toContain('isCorrect');
    const list = await request(app).get('/api/exams').set(auth(s.token));
    expect(list.body.items.find((e: { id: number }) => e.id === exam.id).attempt).toMatchObject({ score: null, resultState: 'WAITING' });
    // لا إشعار لولي الأمر قبل الإعلان
    await new Promise((r) => setTimeout(r, 300));
    expect((await prisma.examAttempt.findUniqueOrThrow({ where: { id: aid } })).parentNotifyQueuedAt).toBeNull();

    // الإعلان: الطالب ممنوع، المساعد مسموح
    expect((await request(app).post(`/api/admin/exams/${exam.id}/release`).set(auth(s.token)).send({ released: true })).status).toBe(403);
    const rel = await request(app).post(`/api/admin/exams/${exam.id}/release`).set(auth(assistantToken)).send({ released: true });
    expect(rel.status).toBe(200);
    expect(rel.body.exam.resultsReleasedAt).not.toBeNull();
    const after = await request(app).get(`/api/attempts/${aid}/result`).set(auth(s.token));
    expect(after.body).toMatchObject({ resultState: 'VISIBLE', score: 1, totalPoints: 1 });
    expect(after.body.review).toHaveLength(1);
    const marked = await eventually(() => prisma.examAttempt.findUniqueOrThrow({ where: { id: aid } }), (a) => a.parentNotifyQueuedAt !== null);
    expect(marked.parentNotifyQueuedAt).not.toBeNull();

    // الإعلان اليدوي مرفوض في غير وضع MANUAL
    const other = await buildExam({ resultRelease: 'IMMEDIATE' }, [tf('س', 1, true)]);
    expect((await request(app).post(`/api/admin/exams/${other.id}/release`).set(auth(adminToken)).send({ released: true })).status).toBe(400);
  });

  it('AFTER_END ← الدرجة والمراجعة مخفيتان حتى نهاية الامتحان للجميع، ثم تظهران', async () => {
    const endAt = new Date(Date.now() + 60 * 60_000);
    const exam = await buildExam({ endAt: endAt.toISOString(), resultRelease: 'AFTER_END' }, [tf('س', 1, true)]);
    const s = students[0]!;
    const st = await request(app).post(`/api/exams/${exam.id}/start`).set(auth(s.token));
    const aid = st.body.attemptId as number;
    attemptIds.push(aid);
    const sub = await request(app).post(`/api/attempts/${aid}/submit`).set(auth(s.token));
    expect(sub.body).toMatchObject({
      resultState: 'WAITING',
      score: null,
      review: null,
      resultAvailableAt: new Date(endAt.getTime() + 5000).toISOString(),
    });
    expect(JSON.stringify(sub.body)).not.toContain('isCorrect');
    // بعد النهاية ← تظهر
    await prisma.exam.update({ where: { id: exam.id }, data: { endAt: new Date(Date.now() - 10_000) } });
    const later = await request(app).get(`/api/attempts/${aid}/result`).set(auth(s.token));
    expect(later.body).toMatchObject({ resultState: 'VISIBLE', score: 0 });
    expect(later.body.review).toHaveLength(1);
  });

  it('AFTER_END يتطلب موعد نهاية (الإنشاء والتعديل)', async () => {
    const bad = await request(app)
      .post('/api/admin/exams')
      .set(auth(adminToken))
      .send({ title: 'TEST-P5 بلا نهاية', grade: 'FOURTH_PRIMARY', durationMin: 5, resultRelease: 'AFTER_END' });
    expect(bad.status).toBe(400);
    const exam = await buildExam({}, [tf('س', 1, true)]);
    expect((await request(app).patch(`/api/admin/exams/${exam.id}`).set(auth(adminToken)).send({ resultRelease: 'AFTER_END' })).status).toBe(400);
  });

  it('بعد أول محاولة: لا تغيير للكورس/الصف، ولا نهاية قبل موعد محاولة قائمة', async () => {
    const endAt = new Date(Date.now() + 60 * 60_000);
    const exam = await buildExam({ endAt: endAt.toISOString(), durationMin: 30 }, [tf('س', 1, true)]);
    const st = await request(app).post(`/api/exams/${exam.id}/start`).set(auth(students[2]!.token));
    attemptIds.push(st.body.attemptId);
    const deadline = Date.parse(st.body.deadlineAt);
    const patch = (body: object) => request(app).patch(`/api/admin/exams/${exam.id}`).set(auth(adminToken)).send(body);
    expect((await patch({ grade: 'SIXTH_PRIMARY' })).status).toBe(409);
    expect((await patch({ courseId })).status).toBe(409);
    expect((await patch({ endAt: new Date(deadline - 60_000).toISOString() })).status).toBe(409);
    // التمديد، أو نفس الصف، أو تعديل العنوان ← مسموح
    expect((await patch({ endAt: new Date(endAt.getTime() + 60_000).toISOString() })).status).toBe(200);
    expect((await patch({ grade: 'FOURTH_PRIMARY', title: 'TEST-P5 معدّل' })).status).toBe(200);
  });

  it('النافذة: قبل البداية أو بعد النهاية ← 403؛ الموعد لا يتجاوز endAt', async () => {
    const upcoming = await buildExam({ startAt: new Date(Date.now() + 3600_000).toISOString() }, [tf('س', 1, true)]);
    const r1 = await request(app).post(`/api/exams/${upcoming.id}/start`).set(auth(students[1]!.token));
    expect(r1.status).toBe(403);
    const list = await request(app).get('/api/exams').set(auth(students[1]!.token));
    expect(list.body.items.find((e: { id: number }) => e.id === upcoming.id).state).toBe('UPCOMING');

    const past = await buildExam({ startAt: new Date(Date.now() - 7200_000).toISOString(), endAt: new Date(Date.now() - 3600_000).toISOString() }, [tf('س', 1, true)]);
    expect((await request(app).post(`/api/exams/${past.id}/start`).set(auth(students[1]!.token))).status).toBe(403);

    const closing = await buildExam({ endAt: new Date(Date.now() + 5 * 60_000).toISOString() }, [tf('س', 1, true)]);
    const st = await request(app).post(`/api/exams/${closing.id}/start`).set(auth(students[1]!.token));
    attemptIds.push(st.body.attemptId);
    expect(Date.parse(st.body.deadlineAt)).toBeLessThanOrEqual(Date.now() + 5 * 60_000 + 1000);
  });

  it('امتحان الكورس يتطلب اشتراكاً ساريًا؛ امتحان صف آخر غير مرئي', async () => {
    const exam = await buildExam({ courseId }, [tf('س', 1, true)]);
    const s = students[1]!;
    const hidden = await request(app).get(`/api/exams/${exam.id}`).set(auth(s.token));
    expect(hidden.status).toBe(404);
    expect((await request(app).post(`/api/exams/${exam.id}/start`).set(auth(s.token))).status).toBe(404);

    await prisma.enrollment.create({ data: { userId: s.id, courseId, source: 'ADMIN', expiresAt: new Date(Date.now() + 86400_000) } });
    expect((await request(app).get(`/api/exams/${exam.id}`).set(auth(s.token))).status).toBe(200);

    const otherGrade = await buildExam({ grade: 'SIXTH_PRIMARY' }, [tf('س', 1, true)]);
    expect((await request(app).get(`/api/exams/${otherGrade.id}`).set(auth(s.token))).status).toBe(404);
  });

  it('غير المنشور غير مرئي للطالب', async () => {
    const exam = await buildExam({}, [tf('س', 1, true)]);
    await request(app).patch(`/api/admin/exams/${exam.id}`).set(auth(adminToken)).send({ isPublished: false });
    expect((await request(app).get(`/api/exams/${exam.id}`).set(auth(students[1]!.token))).status).toBe(404);
  });
});

// ── الأسئلة الكتابية: مقالي / أكمل / اذكر المصطلح — تصحيح يدوي ─────────
describe('written questions + manual grading', () => {
  const written = (type: 'ESSAY' | 'COMPLETE' | 'TERM', text: string, points: number, modelAnswer?: string) => ({
    type,
    text,
    points,
    ...(modelAnswer && { modelAnswer }),
  });

  it('الأدمن: الكتابي بلا اختيارات، والإجابة النموذجية للكتابي فقط', async () => {
    const e = await request(app).post('/api/admin/exams').set(auth(adminToken)).send({ title: 'TEST-P5 كتابي', grade: 'FOURTH_PRIMARY', durationMin: 5 });
    const id = e.body.exam.id as number;
    const add = (q: object) => request(app).post(`/api/admin/exams/${id}/questions`).set(auth(adminToken)).send(q);
    expect((await add({ ...written('ESSAY', 'س', 2), choices: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] })).status).toBe(400);
    expect((await add({ ...mcq('س', 1, 0), modelAnswer: 'x' })).status).toBe(400);
    const ok = await add(written('TERM', 'اذكر المصطلح: تحوّل الماء لبخار', 2, 'التبخر'));
    expect(ok.status).toBe(201);
    expect(ok.body.exam.questions[0]).toMatchObject({ type: 'TERM', modelAnswer: 'التبخر', choices: [] });
  });

  it('الطالب يكتب، والمحاولة تنتظر التصحيح؛ المس تصحّح ← تظهر الدرجة ويُشعَر ولي الأمر', async () => {
    const exam = await buildExam({ notifyParent: true }, [
      mcq('موضوعي', 2, 0),
      written('ESSAY', 'اشرح دورة الماء', 5, 'تبخر ثم تكثف ثم هطول'),
      written('COMPLETE', 'يتحوّل الماء إلى ثلج عند ....', 1),
      written('TERM', 'تحوّل الغاز لسائل', 2),
    ]);
    const [objective, essay, complete, term] = exam.questions;
    const s = students[1]!;
    const st = await request(app).post(`/api/exams/${exam.id}/start`).set(auth(s.token));
    const aid = st.body.attemptId as number;
    attemptIds.push(aid);
    // لا إجابة نموذجية ولا isCorrect في جلسة الطالب
    expect(JSON.stringify(st.body)).not.toMatch(/isCorrect|modelAnswer|تبخر ثم/);

    const save = (body: object) => request(app).patch(`/api/attempts/${aid}/answer`).set(auth(s.token)).send(body);
    expect((await save({ questionId: objective!.id, choiceId: correctOf(objective!) })).status).toBe(200);
    expect((await save({ questionId: essay!.id, text: 'الماء يتبخر' })).status).toBe(200);
    expect((await save({ questionId: essay!.id, text: 'الماء يتبخر ثم يتكثف' })).status).toBe(200); // آخر نص يفوز
    expect((await save({ questionId: term!.id, text: 'التكثف' })).status).toBe(200);
    // اختيار على سؤال كتابي، ونص أطول من حد «أكمل» ← 400
    expect((await save({ questionId: essay!.id, choiceId: correctOf(objective!) })).status).toBe(400);
    expect((await save({ questionId: complete!.id, text: 'x'.repeat(301) })).status).toBe(400);
    // استئناف: النصوص المحفوظة ترجع
    const resumed = await request(app).post(`/api/exams/${exam.id}/start`).set(auth(s.token));
    expect(resumed.body.texts).toEqual({ [essay!.id]: 'الماء يتبخر ثم يتكثف', [term!.id]: 'التكثف' });

    const sub = await request(app).post(`/api/attempts/${aid}/submit`).set(auth(s.token));
    expect(sub.body).toMatchObject({ status: 'SUBMITTED', resultState: 'GRADING', score: null, review: null });
    const row = await prisma.examAttempt.findUniqueOrThrow({ where: { id: aid } });
    expect(row).toMatchObject({ score: 2, totalPoints: 10, gradedAt: null });
    await new Promise((r) => setTimeout(r, 300));
    expect((await prisma.examAttempt.findUniqueOrThrow({ where: { id: aid } })).parentNotifyQueuedAt).toBeNull();

    // لوحة الأدمن: ينتظر التصحيح
    const list = await request(app).get(`/api/admin/exams/${exam.id}/attempts?grading=PENDING`).set(auth(adminToken));
    expect(list.body.items.map((a: { id: number }) => a.id)).toEqual([aid]);
    expect((await request(app).get(`/api/admin/exams/${exam.id}`).set(auth(adminToken))).body.exam.pendingGrading).toBe(1);
    const detail = await request(app).get(`/api/admin/attempts/${aid}`).set(auth(assistantToken));
    expect(detail.status).toBe(200);
    expect(detail.body.attempt.pendingCount).toBe(2);
    expect(detail.body.attempt.items.find((i: { questionId: number }) => i.questionId === essay!.id)).toMatchObject({
      manual: true,
      answerText: 'الماء يتبخر ثم يتكثف',
      modelAnswer: 'تبخر ثم تكثف ثم هطول',
      awardedPoints: null,
    });
    expect((await request(app).get(`/api/admin/attempts/${aid}`).set(auth(s.token))).status).toBe(403);

    const grade = (grades: object[]) => request(app).patch(`/api/admin/attempts/${aid}/grade`).set(auth(adminToken)).send({ grades });
    expect((await grade([{ questionId: essay!.id, points: 6 }])).status).toBe(400); // أكبر من درجة السؤال
    expect((await grade([{ questionId: objective!.id, points: 1 }])).status).toBe(400); // موضوعي
    expect((await grade([{ questionId: complete!.id, points: 1 }])).status).toBe(400); // لم يجب
    expect((await request(app).patch(`/api/admin/attempts/${aid}/grade`).set(auth(s.token)).send({ grades: [{ questionId: essay!.id, points: 1 }] })).status).toBe(403);

    // تصحيح جزئي ← ما زال ينتظر
    const partial = await grade([{ questionId: essay!.id, points: 4, feedback: 'نسيت الهطول' }]);
    expect(partial.status).toBe(200);
    expect(partial.body.attempt).toMatchObject({ pendingCount: 1, gradedAt: null, score: 6 });
    expect((await request(app).get(`/api/attempts/${aid}/result`).set(auth(s.token))).body).toMatchObject({ resultState: 'GRADING', score: null });

    // اكتمال التصحيح ← الدرجة تظهر (IMMEDIATE) بالمراجعة الكاملة
    const done = await grade([{ questionId: term!.id, points: 0, feedback: 'المصطلح: التكثف ليس صحيحاً هنا' }]);
    expect(done.body.attempt).toMatchObject({ pendingCount: 0, score: 6 });
    expect(done.body.attempt.gradedAt).not.toBeNull();
    const result = await request(app).get(`/api/attempts/${aid}/result`).set(auth(s.token));
    expect(result.body).toMatchObject({ resultState: 'VISIBLE', score: 6, totalPoints: 10, percent: 60, answeredCount: 3 });
    const essayReview = result.body.review.find((r: { questionId: number }) => r.questionId === essay!.id);
    expect(essayReview).toMatchObject({ earned: 4, correct: false, answerText: 'الماء يتبخر ثم يتكثف', feedback: 'نسيت الهطول', modelAnswer: 'تبخر ثم تكثف ثم هطول', choices: [] });
    expect(result.body.review.find((r: { questionId: number }) => r.questionId === complete!.id)).toMatchObject({ earned: 0, answerText: null });
    const marked = await eventually(() => prisma.examAttempt.findUniqueOrThrow({ where: { id: aid } }), (a) => a.parentNotifyQueuedAt !== null);
    expect(marked.parentNotifyQueuedAt).not.toBeNull();

    // تعديل التصحيح لاحقاً مسموح ويعيد حساب الدرجة
    const regrade = await grade([{ questionId: essay!.id, points: 5 }]);
    expect(regrade.body.attempt.score).toBe(7);
    // التحليلات تحسب الكتابي (الدرجة الكاملة = صح)
    const stats = await request(app).get(`/api/admin/exams/${exam.id}/analytics`).set(auth(adminToken));
    expect(stats.body).toMatchObject({ finished: 1, pendingGrading: 0, highest: 7 });
    expect(stats.body.questions.find((q: { questionId: number }) => q.questionId === essay!.id)).toMatchObject({ answered: 1, correct: 1 });
    expect(stats.body.questions.find((q: { questionId: number }) => q.questionId === term!.id)).toMatchObject({ answered: 1, correct: 0 });
  });

  it('محاولة كتابية فارغة ← مصحّحة فوراً (لا شيء لتصحيحه)', async () => {
    const exam = await buildExam({}, [written('TERM', 'مصطلح', 2)]);
    const s = students[2]!;
    const st = await request(app).post(`/api/exams/${exam.id}/start`).set(auth(s.token));
    attemptIds.push(st.body.attemptId);
    await request(app).patch(`/api/attempts/${st.body.attemptId}/answer`).set(auth(s.token)).send({ questionId: exam.questions[0]!.id, text: '   ' });
    const sub = await request(app).post(`/api/attempts/${st.body.attemptId}/submit`).set(auth(s.token));
    expect(sub.body).toMatchObject({ resultState: 'VISIBLE', score: 0, totalPoints: 2 });
  });

  it('job إشعار ولي الأمر يرسل مرة واحدة فقط حتى لو تكرر', async () => {
    const { parentExamResultJob } = await import('../src/modules/notifications/producers.js');
    const exam = await buildExam({ notifyParent: true }, [tf('س', 1, true)]);
    const s = students[0]!;
    const st = await request(app).post(`/api/exams/${exam.id}/start`).set(auth(s.token));
    const aid = st.body.attemptId as number;
    attemptIds.push(aid);
    await request(app).post(`/api/attempts/${aid}/submit`).set(auth(s.token));
    // الـ job الحقيقي في الطابور قد يعالجه عامل خادم التطوير في أي لحظة ← نزيله (أو ننتظر انتهاءه)
    // قبل إعادة الضبط، حتى لا يسبق الاستدعاءين المباشرين
    await eventually(() => prisma.examAttempt.findUniqueOrThrow({ where: { id: aid } }), (a) => a.parentNotifyQueuedAt !== null);
    const gone = await eventually(
      async () => {
        const j = await notifications.getJob(`parent-result-${aid}`);
        if (!j) return true;
        const state = await j.getState();
        if (state === 'completed' || state === 'failed') return true;
        await j.remove().catch(() => undefined); // active (مقفول لدى العامل) ← يفشل، نعيد المحاولة
        return !(await notifications.getJob(`parent-result-${aid}`));
      },
      (ok) => ok,
      10_000,
    );
    expect(gone).toBe(true);
    // إعادة الضبط: لا علامة ولا رسالة سابقة (قد يكون عامل خادم التطوير أنشأها — نزيل job تسليمها أولاً)
    const prev = await prisma.notification.findUnique({ where: { dedupeKey: `parent-result:${aid}` } });
    if (prev) {
      await eventually(() => prisma.notification.findUniqueOrThrow({ where: { id: prev.id } }), (n) => n.status !== 'PENDING');
      await removeWhenIdle((await import('../src/lib/queue.js')).getQueue('messages'), `msg-${prev.id}`);
      await prisma.notification.delete({ where: { id: prev.id } });
    }
    await prisma.examAttempt.update({ where: { id: aid }, data: { parentNotifiedAt: null } });
    const job = { data: { attemptId: aid } } as never;
    const [a, b] = await Promise.all([parentExamResultJob(job), parentExamResultJob(job)]);
    expect([a, b].filter((r) => 'queued' in r)).toHaveLength(1);
    expect(await prisma.notification.count({ where: { dedupeKey: `parent-result:${aid}` } })).toBe(1);
  });
});

// ── رفع صورة السؤال ──────────────────────────────────────────────
describe('question image upload', () => {
  it('يقبل PNG حقيقياً ويحوّله WebP؛ يرفض ملفاً ليس صورة ونوعاً غير مسموح', async () => {
    const sharp = (await import('sharp')).default;
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#8fd14f' } }).png().toBuffer();
    const ok = await request(app).post('/api/admin/uploads/image').set(auth(assistantToken)).attach('file', png, { filename: 'q.png', contentType: 'image/png' });
    expect(ok.status).toBe(201);
    expect(ok.body.url).toMatch(/^\/api\/uploads\/[a-f0-9]{32}\.webp$/);
    const served = await request(app).get(ok.body.url);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/webp');

    const fake = await request(app).post('/api/admin/uploads/image').set(auth(adminToken)).attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);
    const pdf = await request(app).post('/api/admin/uploads/image').set(auth(adminToken)).attach('file', Buffer.from('%PDF-1.4'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(pdf.status).toBe(400);
    expect((await request(app).post('/api/admin/uploads/image').set(auth(students[0]!.token)).attach('file', png, 'q.png')).status).toBe(403);

    // الصورة المرفوعة صالحة كـ imageUrl لسؤال
    const exam = await request(app).post('/api/admin/exams').set(auth(adminToken)).send({ title: 'TEST-P5 صورة', grade: 'FOURTH_PRIMARY', durationMin: 5 });
    const q = await request(app).post(`/api/admin/exams/${exam.body.exam.id}/questions`).set(auth(adminToken)).send({ ...tf('بالصورة', 1, true), imageUrl: ok.body.url });
    expect(q.status).toBe(201);
    expect(q.body.exam.questions[0].imageUrl).toBe(ok.body.url);

    // تنظيف الملف
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { UPLOAD_DIR } = await import('../src/lib/uploads.js');
    await fs.rm(path.join(UPLOAD_DIR, ok.body.url.split('/').pop()), { force: true });
  });
});

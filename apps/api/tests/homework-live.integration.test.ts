// اختبارات تكامل الواجبات والحصص اللايف (Phase 6) على قاعدة البيانات الحقيقية + Redis:
// التحقق من محتوى الملف/حجمه، الخصوصية و IDOR، سياسة التسليم (استبدال/تأخير)، التصحيح والتدقيق،
// نافذة joinUrl، job التذكير، و RBAC. كل البيانات بأرقام 0155597xxxx وعناوين TEST-P6 وتُحذف في النهاية.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import type supertestType from 'supertest';
import type { Queue } from 'bullmq';
import sharp from 'sharp';
import { UPLOAD_LIMITS, LIVE_JOIN_EARLY_MIN } from '@miss-ann/shared';
import type { FileStorage } from '../src/lib/storage.js';

const PHONE_PREFIX = '0155597';
const T = 'TEST-P6';
// العناوين الدقيقة التي ينشئها هذا الملف فقط (لا نحذف بيانات TEST-P6 أخرى، مثل تجهيزات المتصفح)
const COURSE_TITLES = [`${T} كورس`, `${T} كورس آخر`, `${T} كورس للحذف`];

let app: Express;
let prisma: PrismaClient;
let request: typeof supertestType;
let sign: (p: { sub: number; role: 'STUDENT' | 'ADMIN' | 'ASSISTANT'; name: string }) => string;
let notifications: Queue;
let closeQueues: () => Promise<void>;
let storage: FileStorage;
let reminderJobId: (id: number, startAt: Date) => string;

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const H = 60 * 60_000;
const M = 60_000;

// s1/s2 مشتركان، s3 غير مشترك
const st: Record<'s1' | 's2' | 's3', { id: number; token: string }> = {} as never;
let adminId = 0;
let adminToken = '';
let assistantToken = '';
let courseId = 0;
let lessonId = 0;
let otherLessonId = 0;
const liveJobIds = new Set<string>();

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
let PNG: Buffer;
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');

async function cleanup() {
  const users = await prisma.user.findMany({ where: { phone: { startsWith: PHONE_PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  // ملفات التخزين الخاص أولاً (الصفوف تُحذف بالتتابع مع الكورس)
  const hws = await prisma.homework.findMany({
    where: { course: { title: { in: COURSE_TITLES } } },
    select: { attachmentKey: true, submissions: { select: { fileKey: true } } },
  });
  for (const h of hws) {
    for (const k of [h.attachmentKey, ...h.submissions.map((s) => s.fileKey)]) if (k) await storage.remove(k);
  }
  await prisma.course.deleteMany({ where: { title: { in: COURSE_TITLES } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

async function eventually<V>(fn: () => Promise<V>, ok: (v: V) => boolean, ms = 5000): Promise<V> {
  const t0 = Date.now();
  let v = await fn();
  while (!ok(v) && Date.now() - t0 < ms) {
    await new Promise((r) => setTimeout(r, 100));
    v = await fn();
  }
  return v;
}

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

const mkUser = (n: string, role: 'STUDENT' | 'ADMIN' | 'ASSISTANT', name: string) =>
  prisma.user.create({
    data: {
      name,
      phone: `${PHONE_PREFIX}${n}`,
      parentPhone: '01000000002',
      passwordHash: 'x',
      isActive: true,
      role,
      ...(role === 'STUDENT' && { grade: 'FOURTH_PRIMARY' as const }),
    },
  });

beforeAll(async () => {
  await import('dotenv/config');
  ({ prisma } = await import('../src/lib/prisma.js'));
  const { createApp } = await import('../src/app.js');
  ({ signAccessToken: sign } = (await import('../src/lib/tokens.js')) as never);
  const q = await import('../src/lib/queue.js');
  notifications = q.getQueue('notifications');
  closeQueues = q.closeQueues;
  ({ privateStorage: storage } = await import('../src/lib/storage.js'));
  ({ reminderJobId } = await import('../src/modules/live/live.service.js'));
  request = (await import('supertest')).default;
  app = createApp();
  PNG = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#ffcc00' } }).png().toBuffer();

  await cleanup();
  for (const [i, k] of (['s1', 's2', 's3'] as const).entries()) {
    const u = await mkUser(String(i + 1).padStart(4, '0'), 'STUDENT', `طالب واجب ${i + 1}`);
    st[k] = { id: u.id, token: sign({ sub: u.id, role: 'STUDENT', name: u.name }) };
  }
  const admin = await mkUser('0099', 'ADMIN', 'أدمن واجبات');
  adminId = admin.id;
  adminToken = sign({ sub: admin.id, role: 'ADMIN', name: admin.name });
  const assistant = await mkUser('0098', 'ASSISTANT', 'مساعد واجبات');
  assistantToken = sign({ sub: assistant.id, role: 'ASSISTANT', name: assistant.name });

  const course = await prisma.course.create({
    data: { title: COURSE_TITLES[0], description: 'اختبار', grade: 'FOURTH_PRIMARY', type: 'MONTHLY', price: 1000, isPublished: true },
  });
  courseId = course.id;
  lessonId = (await prisma.lesson.create({ data: { courseId, title: `${T} حصة`, order: 1 } })).id;
  const other = await prisma.course.create({
    data: { title: COURSE_TITLES[1], description: 'اختبار', grade: 'FOURTH_PRIMARY', type: 'MONTHLY', price: 1000 },
  });
  otherLessonId = (await prisma.lesson.create({ data: { courseId: other.id, title: `${T} حصة أخرى`, order: 1 } })).id;
  const expiresAt = new Date(Date.now() + 30 * 24 * H);
  await prisma.enrollment.createMany({
    data: [st.s1, st.s2].map((s) => ({ userId: s.id, courseId, source: 'ADMIN' as const, expiresAt })),
  });
}, 30_000);

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
  // التذكيرات أولاً (بعد انتهاء أي تنفيذ جارٍ) ثم رسائل واتساب التي أنشأتها — لا رسالة تُنشأ بعد الاستعلام
  for (const id of liveJobIds) await removeWhenIdle(notifications, id);
  await removeTestMessages();
  await cleanup();
  await closeQueues();
  await prisma.$disconnect();
});

// ── RBAC ──────────────────────────────────────────────────────────
describe('RBAC', () => {
  it('الطالب 403 على مسارات الأدمن؛ المساعد يصل للواجبات واللايف ومسارات المحتوى', async () => {
    for (const [method, url] of [
      ['get', '/api/admin/homework'],
      ['post', '/api/admin/homework'],
      ['get', '/api/admin/live'],
      ['post', '/api/admin/live'],
    ] as const) {
      const r = await request(app)[method](url).set(auth(st.s1.token)).send({});
      expect(r.status, `${method} ${url}`).toBe(403);
    }
    expect((await request(app).get('/api/admin/homework').set(auth(assistantToken))).status).toBe(200);
    expect((await request(app).get('/api/admin/live').set(auth(assistantToken))).status).toBe(200);
    expect((await request(app).get('/api/admin/courses').set(auth(assistantToken))).status).toBe(200);
    expect((await request(app).get(`/api/admin/courses/${courseId}`).set(auth(assistantToken))).status).toBe(200);
    // الأدمن ليس طالباً: مسارات الطالب 403
    expect((await request(app).get('/api/homework').set(auth(adminToken))).status).toBe(403);
    expect((await request(app).get('/api/live').set(auth(adminToken))).status).toBe(403);
  });
});

// ── الواجبات ──────────────────────────────────────────────────────
describe('homework', () => {
  let hwId = 0;
  let lateHwId = 0;
  let s1SubId = 0;
  let s1FirstKey = '';

  it('الأدمن: الحصة يجب أن تتبع الكورس؛ الإنشاء يُسجَّل في AuditLog', async () => {
    const bad = await request(app)
      .post('/api/admin/homework')
      .set(auth(adminToken))
      .send({ courseId, lessonId: otherLessonId, title: `${T} واجب`, maxGrade: 20 });
    expect(bad.status).toBe(400);
    expect(bad.body.fields.lessonId).toBeTruthy();

    const created = await request(app)
      .post('/api/admin/homework')
      .set(auth(adminToken))
      .send({ courseId, lessonId, title: `${T} واجب الخلية`, description: 'ارسم الخلية', maxGrade: 20, dueAt: new Date(Date.now() + 48 * H).toISOString() });
    expect(created.status).toBe(201);
    expect(created.body.homework).toMatchObject({ maxGrade: 20, lessonId, courseTitle: `${T} كورس`, submissionsCount: 0 });
    hwId = created.body.homework.id;

    const late = await request(app)
      .post('/api/admin/homework')
      .set(auth(assistantToken))
      .send({ courseId, title: `${T} واجب متأخر`, dueAt: new Date(Date.now() - H).toISOString() });
    expect(late.status).toBe(201);
    lateHwId = late.body.homework.id;

    const logs = await prisma.auditLog.count({ where: { action: 'HOMEWORK_CREATE', actorId: adminId } });
    expect(logs).toBe(1);
  });

  it('الطالب المشترك يرى الواجب «مطلوب» والمتأخر «LATE»؛ غير المشترك لا يرى شيئاً (404 للمعرّف)', async () => {
    const r = await request(app).get('/api/homework?tab=REQUIRED').set(auth(st.s1.token));
    expect(r.status).toBe(200);
    const mine = r.body.items.filter((i: { id: number }) => [hwId, lateHwId].includes(i.id));
    expect(mine.find((i: { id: number }) => i.id === hwId).status).toBe('REQUIRED');
    expect(mine.find((i: { id: number }) => i.id === lateHwId).status).toBe('LATE');
    expect(r.body.counts.REQUIRED).toBeGreaterThanOrEqual(2);

    const other = await request(app).get('/api/homework?tab=REQUIRED').set(auth(st.s3.token));
    expect(other.status).toBe(200);
    expect(other.body.items.some((i: { id: number }) => i.id === hwId)).toBe(false);
    expect((await request(app).get(`/api/homework/${hwId}/submission`).set(auth(st.s3.token))).status).toBe(404);
    const sub = await request(app).post(`/api/homework/${hwId}/submit`).set(auth(st.s3.token)).attach('file', PDF, { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(sub.status).toBe(404);
  });

  it('رفض الملفات: نوع خاطئ، PDF مزيّف، SVG متنكّر كصورة، حجم زائد، بلا ملف — 400 عربي', async () => {
    const post = () => request(app).post(`/api/homework/${hwId}/submit`).set(auth(st.s2.token));

    const txt = await post().attach('file', Buffer.from('hello'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(txt.status).toBe(400);
    expect(txt.body.message).toMatch(/نوع الملف/);

    const fake = await post().attach('file', Buffer.from('I am plain text, not a PDF'), { filename: 'hw.pdf', contentType: 'application/pdf' });
    expect(fake.status).toBe(400);
    expect(fake.body.message).toMatch(/ليس PDF أو صورة/);

    const svg = await post().attach('file', SVG, { filename: 'x.png', contentType: 'image/png' });
    expect(svg.status).toBe(400);

    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(UPLOAD_LIMITS.homeworkMaxBytes + 1024)]);
    const huge = await post().attach('file', big, { filename: 'big.pdf', contentType: 'application/pdf' });
    expect(huge.status).toBe(400);
    expect(huge.body.message).toMatch(/حجم الملف/);

    const none = await post();
    expect(none.status).toBe(400);

    expect(await prisma.homeworkSubmission.count({ where: { homeworkId: hwId, userId: st.s2.id } })).toBe(0);
  });

  it('التسليم ثم الاستبدال قبل التصحيح: الملف القديم يُحذف بعد حفظ الجديد، والصورة تُعاد ترميزها WebP', async () => {
    const first = await request(app)
      .post(`/api/homework/${hwId}/submit`)
      .set(auth(st.s1.token))
      .attach('file', PDF, { filename: 'حل الواجب.pdf', contentType: 'application/pdf' });
    expect(first.status).toBe(201);
    expect(first.body.submission).toMatchObject({ fileMime: 'application/pdf', fileName: 'حل الواجب.pdf', isLate: false, grade: null, canResubmit: true });
    s1SubId = first.body.submission.id;
    s1FirstKey = (await prisma.homeworkSubmission.findUniqueOrThrow({ where: { id: s1SubId } })).fileKey;
    expect(s1FirstKey).toMatch(/^submissions\/[a-f0-9]{32}\.pdf$/);
    expect(await storage.open(s1FirstKey)).not.toBeNull();

    const second = await request(app)
      .post(`/api/homework/${hwId}/submit`)
      .set(auth(st.s1.token))
      .attach('file', PNG, { filename: 'photo.png', contentType: 'image/png' });
    expect(second.status).toBe(201);
    expect(second.body.submission).toMatchObject({ id: s1SubId, fileMime: 'image/webp', fileName: 'photo.webp' });
    const row = await prisma.homeworkSubmission.findUniqueOrThrow({ where: { id: s1SubId } });
    expect(row.fileKey).not.toBe(s1FirstKey);
    const old = await storage.open(s1FirstKey);
    expect(old).toBeNull();
    const cur = await storage.open(row.fileKey);
    expect(cur).not.toBeNull();
    cur!.stream.destroy();

    const list = await request(app).get('/api/homework?tab=SUBMITTED').set(auth(st.s1.token));
    expect(list.body.items.find((i: { id: number }) => i.id === hwId)?.status).toBe('SUBMITTED');
  });

  it('IDOR والخصوصية: لا تنزيل/قراءة/كتابة فوق تسليم طالب آخر؛ المالك والفريق فقط، بدون كاش', async () => {
    // s2 يسلّم واجبه الخاص — لا يلمس تسليم s1
    const s2sub = await request(app)
      .post(`/api/homework/${hwId}/submit`)
      .set(auth(st.s2.token))
      .attach('file', PDF, { filename: 's2.pdf', contentType: 'application/pdf' });
    expect(s2sub.status).toBe(201);
    expect(s2sub.body.submission.id).not.toBe(s1SubId);
    const s1Row = await prisma.homeworkSubmission.findUniqueOrThrow({ where: { id: s1SubId } });
    expect(s1Row.userId).toBe(st.s1.id);
    expect(s1Row.fileMime).toBe('image/webp');

    // قراءة التسليم تعيد تسليم الطالب نفسه فقط
    const own = await request(app).get(`/api/homework/${hwId}/submission`).set(auth(st.s2.token));
    expect(own.body.submission.id).toBe(s2sub.body.submission.id);

    // تنزيل ملف s1 من s2 أو من غير المشترك ← 404 (المعرّف موجود فعلاً)
    for (const t of [st.s2.token, st.s3.token]) {
      expect((await request(app).get(`/api/homework/submissions/${s1SubId}/file`).set(auth(t))).status).toBe(404);
    }
    expect((await request(app).get('/api/homework/submissions/2147483000/file').set(auth(st.s1.token))).status).toBe(404);
    expect((await request(app).get(`/api/homework/submissions/${s1SubId}/file`)).status).toBe(401);

    for (const t of [st.s1.token, adminToken, assistantToken]) {
      const r = await request(app).get(`/api/homework/submissions/${s1SubId}/file`).set(auth(t)).buffer(true);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toBe('image/webp');
      expect(r.headers['content-disposition']).toMatch(/^attachment; filename="photo.webp"/);
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.headers['cache-control']).toBe('private, no-store');
    }

    // لا يُقدَّم من المسار العام أبداً
    expect((await request(app).get(`/api/uploads/${s1Row.fileKey}`)).status).toBe(404);
    expect((await request(app).get(`/api/uploads/${s1Row.fileKey.split('/')[1]}`)).status).toBe(404);
  });

  it('التسليم المتأخر مقبول ويُعلَّم متأخراً (السياسة الافتراضية)', async () => {
    const r = await request(app)
      .post(`/api/homework/${lateHwId}/submit`)
      .set(auth(st.s1.token))
      .attach('file', PDF, { filename: 'late.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(201);
    expect(r.body.submission.isLate).toBe(true);
    const admin = await request(app).get(`/api/admin/homework/${lateHwId}/submissions`).set(auth(adminToken));
    expect(admin.body.items[0]).toMatchObject({ isLate: true, user: { id: st.s1.id } });
  });

  it('التصحيح: المدى 0..maxGrade، gradedAt، التدقيق، والطالب يرى الدرجة والملاحظات ولا يستبدل بعدها', async () => {
    const url = `/api/admin/homework/${hwId}/submissions/${s1SubId}/grade`;
    const submittedAt = (await prisma.homeworkSubmission.findUniqueOrThrow({ where: { id: s1SubId } })).submittedAt.toISOString();
    const send = (body: Record<string, unknown>, token = adminToken, u = url) =>
      request(app).patch(u).set(auth(token)).send({ submittedAt, ...body });

    const over = await send({ grade: 21 });
    expect(over.status).toBe(400);
    expect(over.body.fields.grade).toBeTruthy();
    expect((await send({ grade: -1 })).status).toBe(400);
    expect((await send({ grade: 7.5 })).status).toBe(400);
    // بلا نسخة الحل ← 400 (Zod)
    expect((await request(app).patch(url).set(auth(adminToken)).send({ grade: 5 })).status).toBe(400);
    // تسليم لا يتبع هذا الواجب ← 404
    expect((await send({ grade: 5 }, adminToken, `/api/admin/homework/${lateHwId}/submissions/${s1SubId}/grade`)).status).toBe(404);
    expect((await send({ grade: 20 }, st.s1.token)).status).toBe(403);
    // نسخة قديمة (الطالب استبدل ملفه بعد فتح المس له) ← 409 ولا تُكتب درجة
    const stale = await send({ grade: 15, submittedAt: new Date(Date.parse(submittedAt) - 60_000).toISOString() });
    expect(stale.status).toBe(409);
    expect((await prisma.homeworkSubmission.findUniqueOrThrow({ where: { id: s1SubId } })).grade).toBeNull();

    const ok = await send({ grade: 18, feedback: 'ممتاز يا بطل' }, assistantToken);
    expect(ok.status).toBe(200);
    expect(ok.body.submission).toMatchObject({ grade: 18, feedback: 'ممتاز يا بطل' });
    expect(ok.body.submission.gradedAt).toBeTruthy();

    const log = await prisma.auditLog.findFirst({ where: { action: 'HOMEWORK_GRADE', entity: 'HomeworkSubmission' }, orderBy: { id: 'desc' } });
    expect(log?.meta).toMatchObject({ submissionId: s1SubId, grade: 18, previousGrade: null, studentId: st.s1.id });

    const seen = await request(app).get(`/api/homework/${hwId}/submission`).set(auth(st.s1.token));
    expect(seen.body.submission).toMatchObject({ grade: 18, feedback: 'ممتاز يا بطل', canResubmit: false });
    const graded = await request(app).get('/api/homework?tab=GRADED').set(auth(st.s1.token));
    expect(graded.body.items.find((i: { id: number }) => i.id === hwId)?.status).toBe('GRADED');

    const again = await request(app)
      .post(`/api/homework/${hwId}/submit`)
      .set(auth(st.s1.token))
      .attach('file', PDF, { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(again.status).toBe(409);

    // لا تُخفَّض الدرجة النهائية تحت درجة مصحَّحة
    expect((await request(app).patch(`/api/admin/homework/${hwId}`).set(auth(adminToken)).send({ maxGrade: 10 })).status).toBe(409);
  });

  it('قائمة التسليمات للأدمن: ترقيم + فلتر الحالة + عدّادات القائمة', async () => {
    const all = await request(app).get(`/api/admin/homework/${hwId}/submissions?pageSize=1`).set(auth(adminToken));
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ total: 2, pageSize: 1, totalPages: 2 });
    expect(all.body.items).toHaveLength(1);
    const pending = await request(app).get(`/api/admin/homework/${hwId}/submissions?status=PENDING`).set(auth(adminToken));
    expect(pending.body.items.map((s: { user: { id: number } }) => s.user.id)).toEqual([st.s2.id]);
    const list = await request(app).get(`/api/admin/homework?courseId=${courseId}`).set(auth(adminToken));
    expect(list.body.items.find((h: { id: number }) => h.id === hwId)).toMatchObject({ submissionsCount: 2, gradedCount: 1 });
  });

  it('مرفق الواجب: PDF مزيّف مرفوض؛ الصالح للمشترك والفريق فقط؛ الحذف يحذف كل الملفات', async () => {
    const fake = await request(app)
      .post(`/api/admin/homework/${hwId}/attachment`)
      .set(auth(adminToken))
      .attach('file', Buffer.from('not pdf'), { filename: 'sheet.pdf', contentType: 'application/pdf' });
    expect(fake.status).toBe(400);
    const ok = await request(app)
      .post(`/api/admin/homework/${hwId}/attachment`)
      .set(auth(adminToken))
      .attach('file', PDF, { filename: 'ورقة العمل.pdf', contentType: 'application/pdf' });
    expect(ok.status).toBe(200);
    expect(ok.body.homework.attachment).toEqual({ name: 'ورقة العمل.pdf', mime: 'application/pdf' });

    expect((await request(app).get(`/api/homework/${hwId}/attachment`).set(auth(st.s1.token))).status).toBe(200);
    expect((await request(app).get(`/api/homework/${hwId}/attachment`).set(auth(st.s3.token))).status).toBe(404);

    const keys = await prisma.homework.findUniqueOrThrow({
      where: { id: hwId },
      select: { attachmentKey: true, submissions: { select: { fileKey: true } } },
    });
    const all = [keys.attachmentKey!, ...keys.submissions.map((s) => s.fileKey)];
    const del = await request(app).delete(`/api/admin/homework/${hwId}`).set(auth(adminToken));
    expect(del.status).toBe(200);
    for (const k of all) expect(await storage.open(k)).toBeNull();
    expect(await prisma.homeworkSubmission.count({ where: { homeworkId: hwId } })).toBe(0);
  });
});

// ── الحصص اللايف ──────────────────────────────────────────────────
describe('live sessions', () => {
  const create = (body: Record<string, unknown>) =>
    request(app)
      .post('/api/admin/live')
      .set(auth(adminToken))
      .send({ courseId, title: `${T} لايف`, provider: 'ZOOM', joinUrl: 'https://us02web.zoom.us/j/123456789', durationMin: 60, ...body });
  const studentList = async (token: string) => (await request(app).get('/api/live').set(auth(token))).body.items as Record<string, unknown>[];

  it('joinUrl: https ومن مضيفي المزوّد فقط', async () => {
    const startAt = new Date(Date.now() + 3 * H).toISOString();
    for (const joinUrl of [
      'http://zoom.us/j/1',
      'https://zoom.us.evil.com/j/1',
      'https://evilzoom.us/j/1',
      'https://user:pw@zoom.us/j/1',
      'https://zoom.us:8443/j/1',
      'javascript:alert(1)',
    ]) {
      expect((await create({ joinUrl, startAt })).status, joinUrl).toBe(400);
    }
    // رابط Meet مع مزوّد Zoom مرفوض
    expect((await create({ joinUrl: 'https://meet.google.com/abc-defg-hij', startAt })).status).toBe(400);
    // موعد في الماضي مرفوض
    expect((await create({ startAt: new Date(Date.now() - M).toISOString() })).status).toBe(400);
  });

  it('غير المشترك لا يرى الجلسة؛ المشترك قبل النافذة: الحقل غائب؛ داخلها: موجود؛ بعد الانتهاء: غائبة', async () => {
    const later = await create({ startAt: new Date(Date.now() + 2 * H).toISOString() });
    expect(later.status).toBe(201);
    liveJobIds.add(reminderJobId(later.body.session.id, new Date(later.body.session.startAt)));
    const soon = await create({ provider: 'MEET', joinUrl: 'https://meet.google.com/abc-defg-hij', startAt: new Date(Date.now() + (LIVE_JOIN_EARLY_MIN - 5) * M).toISOString() });
    expect(soon.status).toBe(201);
    liveJobIds.add(reminderJobId(soon.body.session.id, new Date(soon.body.session.startAt)));
    // جارية الآن (بدأت منذ 30 دقيقة) ومنتهية — مباشرة في القاعدة (الـ API يمنع المواعيد الماضية)
    const running = await prisma.liveSession.create({
      data: { courseId, title: `${T} جارية`, provider: 'ZOOM', joinUrl: 'https://zoom.us/j/222', startAt: new Date(Date.now() - 30 * M), durationMin: 60 },
    });
    const ended = await prisma.liveSession.create({
      data: { courseId, title: `${T} منتهية`, provider: 'ZOOM', joinUrl: 'https://zoom.us/j/333', startAt: new Date(Date.now() - 3 * H), durationMin: 60 },
    });

    const items = await studentList(st.s1.token);
    const byId = (id: number) => items.find((i) => i.id === id);
    const l = byId(later.body.session.id)!;
    expect(l.state).toBe('UPCOMING');
    expect('joinUrl' in l).toBe(false);
    expect(byId(soon.body.session.id)).toMatchObject({ state: 'OPEN', joinUrl: 'https://meet.google.com/abc-defg-hij' });
    expect(byId(running.id)).toMatchObject({ state: 'OPEN', joinUrl: 'https://zoom.us/j/222' });
    expect(byId(ended.id)).toBeUndefined();
    expect(JSON.stringify(items)).not.toContain('zoom.us/j/333');

    // الأقرب أولاً
    const starts = items.map((i) => Date.parse(i.startAt as string));
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);

    const outsider = await request(app).get('/api/live').set(auth(st.s3.token));
    expect(outsider.status).toBe(200);
    expect(outsider.body.items).toHaveLength(0);
    expect(JSON.stringify(outsider.body)).not.toContain('joinUrl');
    expect(outsider.headers['cache-control']).toBe('private, no-store');

    // الجلسة المنتهية تظهر للأدمن في «السابقة» فقط
    const past = await request(app).get(`/api/admin/live?scope=past&courseId=${courseId}`).set(auth(adminToken));
    expect(past.body.items.map((s: { id: number }) => s.id)).toEqual([ended.id]);
  });

  it('job التذكير: يُجدول عند الإنشاء، يُعاد جدولته عند تغيير الموعد، ويُزال عند الحذف', async () => {
    const start1 = new Date(Date.now() + 5 * H);
    const created = await create({ startAt: start1.toISOString() });
    expect(created.status).toBe(201);
    const id = created.body.session.id as number;
    const job1 = reminderJobId(id, start1);
    liveJobIds.add(job1);
    const j1 = await eventually(() => notifications.getJob(job1), (j) => !!j);
    expect(j1?.name).toBe('live-reminder');
    expect(j1?.data).toEqual({ sessionId: id, startAt: start1.toISOString() });
    expect(await j1!.getState()).toBe('delayed');
    // التذكير قبل الموعد بساعة تقريباً
    expect(j1!.opts.delay).toBeGreaterThan(3.9 * H);
    expect(j1!.opts.delay).toBeLessThan(4.1 * H);

    // تعديل العنوان فقط لا يلمس الـ job
    expect((await request(app).patch(`/api/admin/live/${id}`).set(auth(adminToken)).send({ title: `${T} لايف معدّل` })).status).toBe(200);
    // تغيير المزوّد بدون رابط يطابقه ← 400
    expect((await request(app).patch(`/api/admin/live/${id}`).set(auth(adminToken)).send({ provider: 'MEET' })).status).toBe(400);

    const start2 = new Date(Date.now() + 8 * H);
    const moved = await request(app).patch(`/api/admin/live/${id}`).set(auth(assistantToken)).send({ startAt: start2.toISOString() });
    expect(moved.status).toBe(200);
    const job2 = reminderJobId(id, start2);
    liveJobIds.add(job2);
    expect(await eventually(() => notifications.getJob(job2), (j) => !!j)).toBeTruthy();
    expect(await eventually(() => notifications.getJob(job1), (j) => !j)).toBeFalsy();

    expect((await request(app).delete(`/api/admin/live/${id}`).set(auth(adminToken))).status).toBe(200);
    expect(await eventually(() => notifications.getJob(job2), (j) => !j)).toBeFalsy();

    // الرابط لا يُكتب في AuditLog
    const logs = await prisma.auditLog.findMany({ where: { actorId: adminId, entity: 'LiveSession' }, select: { meta: true } });
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toMatch(/zoom\.us|meet\.google/);
  });
});

// ── مراجعة Phase 6: حالات حدّية وتزامن ─────────────────────────────
// مستخدمون مستقلون (حد التسليم 10/دقيقة لكل طالب) وواجبات جديدة في كورس الاختبار
describe('hardening', () => {
  const extra: Record<'r1' | 'r2' | 'r3' | 'r4', { id: number; token: string }> = {} as never;
  const mkHw = async (body: Record<string, unknown> = {}) => {
    const r = await request(app)
      .post('/api/admin/homework')
      .set(auth(adminToken))
      .send({ courseId, title: `${T} واجب مراجعة`, maxGrade: 10, ...body });
    expect(r.status).toBe(201);
    return r.body.homework.id as number;
  };
  const submit = (hwId: number, token: string, file = PDF, filename = 'a.pdf', contentType = 'application/pdf') =>
    request(app).post(`/api/homework/${hwId}/submit`).set(auth(token)).attach('file', file, { filename, contentType });
  const privateFiles = async (): Promise<Set<string>> => {
    const { LocalDiskStorage } = await import('../src/lib/storage.js');
    if (!(storage instanceof LocalDiskStorage)) return new Set();
    const { env } = await import('../src/lib/env.js');
    const dir = path.resolve(env.PRIVATE_UPLOAD_DIR, 'submissions');
    return new Set((await fs.readdir(dir).catch(() => [] as string[])).map((f) => `submissions/${f}`));
  };

  beforeAll(async () => {
    const expiresAt = new Date(Date.now() + 30 * 24 * H);
    for (const [i, k] of (['r1', 'r2', 'r3', 'r4'] as const).entries()) {
      const u = await mkUser(String(i + 11).padStart(4, '0'), 'STUDENT', `طالب مراجعة ${i + 1}`);
      extra[k] = { id: u.id, token: sign({ sub: u.id, role: 'STUDENT', name: u.name }) };
      await prisma.enrollment.create({ data: { userId: u.id, courseId, source: 'ADMIN', expiresAt } });
    }
  });

  it('joinUrl يُخزَّن بصيغته القياسية (HTTPS/أحرف كبيرة لا تسبب 500 من قيد القاعدة)', async () => {
    const r = await request(app)
      .post('/api/admin/live')
      .set(auth(adminToken))
      .send({ courseId, title: `${T} لايف قياسي`, provider: 'ZOOM', joinUrl: 'HTTPS://US02WEB.ZOOM.US/j/987', startAt: new Date(Date.now() + 30 * H).toISOString(), durationMin: 45 });
    expect(r.status).toBe(201);
    expect(r.body.session.joinUrl).toBe('https://us02web.zoom.us/j/987');
    liveJobIds.add(reminderJobId(r.body.session.id, new Date(r.body.session.startAt)));
    const patched = await request(app).patch(`/api/admin/live/${r.body.session.id}`).set(auth(adminToken)).send({ joinUrl: 'HTTPS://zoom.us/j/988' });
    expect(patched.status).toBe(200);
    expect(patched.body.session.joinUrl).toBe('https://zoom.us/j/988');
  });

  it('رفع مسيء: GIF متنكّر، قنبلة بكسلات، حقول/ملفات إضافية ← 400 ولا يُحفظ شيء', async () => {
    const hwId = await mkHw();
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#00ff00' } }).gif().toBuffer();
    // صورة صغيرة الحجم (مضغوطة) لكن أبعادها 7000×6000 = 42 مليون بكسل > حد فك الضغط
    const bomb = await sharp({ create: { width: 7000, height: 6000, channels: 3, background: '#ffffff' } }).png().toBuffer();
    expect(bomb.length).toBeLessThan(UPLOAD_LIMITS.homeworkMaxBytes);
    const t = extra.r1.token;
    expect((await submit(hwId, t, gif, 'x.png', 'image/png')).status).toBe(400);
    const b = await submit(hwId, t, bomb, 'big.png', 'image/png');
    expect(b.status).toBe(400);
    expect(b.body.message).toMatch(/ليس PDF أو صورة/);
    const withField = await submit(hwId, t).field('userId', String(extra.r2.id));
    expect(withField.status).toBe(400);
    const twoFiles = await submit(hwId, t).attach('file', PDF, { filename: 'b.pdf', contentType: 'application/pdf' });
    expect(twoFiles.status).toBe(400);
    const wrongField = await request(app).post(`/api/homework/${hwId}/submit`).set(auth(t)).attach('solution', PDF, { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(wrongField.status).toBe(400);
    expect(await prisma.homeworkSubmission.count({ where: { homeworkId: hwId } })).toBe(0);
  });

  // عميل HTTP حقيقي (fetch كالمتصفح): Node يصرف الجسم غير المقروء فيصل الرد العربي لا قطع اتصال.
  // (supertest وحده يرمي ECONNRESET هنا لأنه يكتب الجسم بعد وصول الرد — ليس سلوك المتصفح)
  it('الرفض المسبق (غير مشترك) يرد 404 حتى مع جسم ملف كبير لم يُقرأ', async () => {
    const hwId = await mkHw();
    const server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const form = new FormData();
      const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(8 * 1024 * 1024)]);
      form.append('file', new Blob([big], { type: 'application/pdf' }), 'big.pdf');
      const r = await fetch(`http://127.0.0.1:${port}/api/homework/${hwId}/submit`, {
        method: 'POST',
        headers: auth(st.s3.token),
        body: form,
      });
      expect(r.status).toBe(404);
      expect((await r.json()).message).toBe('الواجب غير موجود');
    } finally {
      server.close();
    }
  });

  it('تسليمان أولان متزامنان: صف واحد، ولا ملف يتيم', async () => {
    const hwId = await mkHw();
    const before = await privateFiles();
    const rs = await Promise.all([submit(hwId, extra.r2.token), submit(hwId, extra.r2.token, PNG, 'p.png', 'image/png')]);
    const statuses = rs.map((r) => r.status).sort();
    expect(statuses[0]).toBe(201);
    expect([201, 409]).toContain(statuses[1]);
    const rows = await prisma.homeworkSubmission.findMany({ where: { homeworkId: hwId }, select: { fileKey: true } });
    expect(rows).toHaveLength(1);
    const obj = await storage.open(rows[0]!.fileKey);
    expect(obj).not.toBeNull();
    obj!.stream.destroy();
    const created = [...(await privateFiles())].filter((f) => !before.has(f));
    if (created.length) expect(created).toEqual([rows[0]!.fileKey]);
  });

  it('حذف الواجب أثناء استبدال الطالب لملفه: الاستبدال ينتظر ثم 404، ولا ملف يتيم', async () => {
    const { homeworkFileKeys } = await import('../src/modules/homework/homework.admin.service.js');
    const hwId = await mkHw();
    expect((await submit(hwId, extra.r2.token)).status).toBe(201);
    const before = await privateFiles();
    let pending: Promise<{ status: number }> | undefined;
    // نفس خطوات deleteHomework مع مهلة بين جمع المفاتيح والحذف ليصل الاستبدال في المنتصف
    const keys = await prisma.$transaction(
      async (tx) => {
        const k = await homeworkFileKeys(tx, { id: hwId });
        pending = submit(hwId, extra.r2.token).then((r) => r);
        await new Promise((r) => setTimeout(r, 800));
        await tx.homework.delete({ where: { id: hwId } });
        return k;
      },
      { timeout: 15_000 },
    );
    for (const k of keys) await storage.remove(k);
    expect((await pending!).status).toBe(404);
    const leftover = [...(await privateFiles())].filter((f) => !before.has(f));
    expect(leftover).toEqual([]);
    for (const k of keys) expect(await storage.open(k)).toBeNull();
  });

  it('تصحيح واستبدال متزامنان: واحد فقط ينجح والحالة متسقة', async () => {
    const hwId = await mkHw();
    const first = await submit(hwId, extra.r3.token);
    expect(first.status).toBe(201);
    const subId = first.body.submission.id as number;
    const firstKey = (await prisma.homeworkSubmission.findUniqueOrThrow({ where: { id: subId } })).fileKey;
    const [g, s] = await Promise.all([
      request(app)
        .patch(`/api/admin/homework/${hwId}/submissions/${subId}/grade`)
        .set(auth(adminToken))
        .send({ grade: 7, feedback: '', submittedAt: first.body.submission.submittedAt }),
      submit(hwId, extra.r3.token, PNG, 'p.png', 'image/png'),
    ]);
    const row = await prisma.homeworkSubmission.findUniqueOrThrow({ where: { id: subId } });
    if (g.status === 200) {
      expect(s.status).toBe(409);
      expect(row).toMatchObject({ grade: 7, fileKey: firstKey });
    } else {
      expect(g.status).toBe(409);
      expect(s.status).toBe(201);
      expect(row.grade).toBeNull();
      expect(row.fileKey).not.toBe(firstKey);
    }
  });

  it('خفض الدرجة النهائية والتصحيح متزامنان: الدرجة لا تتجاوز النهائية أبداً', async () => {
    const hwId = await mkHw({ maxGrade: 10 });
    const sub = await submit(hwId, extra.r4.token);
    expect(sub.status).toBe(201);
    const subId = sub.body.submission.id as number;
    for (let i = 0; i < 6; i++) {
      await prisma.homeworkSubmission.update({ where: { id: subId }, data: { grade: null, gradedAt: null } });
      await prisma.homework.update({ where: { id: hwId }, data: { maxGrade: 10 } });
      await Promise.all([
        request(app).patch(`/api/admin/homework/${hwId}`).set(auth(adminToken)).send({ maxGrade: 5 }),
        request(app)
          .patch(`/api/admin/homework/${hwId}/submissions/${subId}/grade`)
          .set(auth(assistantToken))
          .send({ grade: 8, feedback: '', submittedAt: sub.body.submission.submittedAt }),
      ]);
      const [h, s] = await Promise.all([
        prisma.homework.findUniqueOrThrow({ where: { id: hwId }, select: { maxGrade: true } }),
        prisma.homeworkSubmission.findUniqueOrThrow({ where: { id: subId }, select: { grade: true } }),
      ]);
      expect(s.grade ?? 0, `iteration ${i}`).toBeLessThanOrEqual(h.maxGrade);
    }
  });

  it('اشتراك منتهٍ: الواجب وتسليمه وملفاته والحصص تختفي (404)', async () => {
    const hwId = await mkHw();
    const sub = await submit(hwId, extra.r1.token);
    expect(sub.status).toBe(201);
    await request(app)
      .post(`/api/admin/homework/${hwId}/attachment`)
      .set(auth(adminToken))
      .attach('file', PDF, { filename: 'sheet.pdf', contentType: 'application/pdf' })
      .expect(200);
    await prisma.enrollment.update({
      where: { userId_courseId: { userId: extra.r1.id, courseId } },
      data: { expiresAt: new Date(Date.now() - M) },
    });
    const t = auth(extra.r1.token);
    const list = await request(app).get('/api/homework?tab=SUBMITTED').set(t);
    expect(list.body.items.some((i: { id: number }) => i.id === hwId)).toBe(false);
    expect((await request(app).get(`/api/homework/${hwId}/submission`).set(t)).status).toBe(404);
    expect((await request(app).get(`/api/homework/submissions/${sub.body.submission.id}/file`).set(t)).status).toBe(404);
    expect((await request(app).get(`/api/homework/${hwId}/attachment`).set(t)).status).toBe(404);
    expect((await submit(hwId, extra.r1.token)).status).toBe(404);
    const live = await request(app).get('/api/live').set(t);
    expect(live.body.items.some((s: { courseId: number }) => s.courseId === courseId)).toBe(false);
  });

  it('عامل التذكير يتجاهل jobs قديمة (حصة محذوفة أو موعد تغيّر)', async () => {
    const { liveReminderJob } = await import('../src/modules/notifications/producers.js');
    const startAt = new Date(Date.now() + 20 * H);
    const s = await prisma.liveSession.create({
      data: { courseId, title: `${T} تذكير`, provider: 'ZOOM', joinUrl: 'https://zoom.us/j/777', startAt, durationMin: 30 },
    });
    const job = (data: { sessionId: number; startAt: string }) => ({ data }) as never;
    // كل مشترك ساري بإشعار داخلي واحد، وغير المشترك (s3) لا شيء
    const active = await prisma.enrollment.count({ where: { courseId, expiresAt: { gt: new Date() }, user: { isActive: true } } });
    expect(active).toBeGreaterThanOrEqual(2);
    expect(await liveReminderJob(job({ sessionId: s.id, startAt: startAt.toISOString() }))).toEqual({ recipients: active });
    const reminded = await prisma.notification.findMany({ where: { type: 'LIVE_REMINDER', channel: 'IN_APP', dedupeKey: { startsWith: `live:${s.id}:` } } });
    expect(reminded).toHaveLength(active);
    expect(reminded.some((n) => n.userId === st.s3.id)).toBe(false);
    expect(await liveReminderJob(job({ sessionId: s.id, startAt: new Date(startAt.getTime() - H).toISOString() }))).toEqual({ skipped: true, reason: 'stale' });
    await prisma.liveSession.delete({ where: { id: s.id } });
    expect(await liveReminderJob(job({ sessionId: s.id, startAt: startAt.toISOString() }))).toEqual({ skipped: true, reason: 'stale' });
  });
});

// ── حذف الكورس (cascade) ──────────────────────────────────────────
describe('course delete cascade', () => {
  it('يحذف ملفات الواجبات الخاصة وjobs تذكير اللايف بعد حذف الكورس (لا ملفات يتيمة)', async () => {
    const course = await prisma.course.create({
      data: { title: COURSE_TITLES[2], description: 'اختبار', grade: 'FOURTH_PRIMARY', type: 'MONTHLY', price: 1000 },
    });
    await prisma.enrollment.create({
      data: { userId: st.s1.id, courseId: course.id, source: 'ADMIN', expiresAt: new Date(Date.now() + 24 * H) },
    });
    const hw = await request(app).post('/api/admin/homework').set(auth(adminToken)).send({ courseId: course.id, title: `${T} واجب للحذف` });
    expect(hw.status).toBe(201);
    const hwId = hw.body.homework.id as number;
    expect(
      (await request(app).post(`/api/admin/homework/${hwId}/attachment`).set(auth(adminToken)).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })).status,
    ).toBe(200);
    expect(
      (await request(app).post(`/api/homework/${hwId}/submit`).set(auth(st.s1.token)).attach('file', PDF, { filename: 's.pdf', contentType: 'application/pdf' })).status,
    ).toBe(201);
    const startAt = new Date(Date.now() + 6 * H);
    const live = await request(app)
      .post('/api/admin/live')
      .set(auth(adminToken))
      .send({ courseId: course.id, title: `${T} لايف للحذف`, provider: 'ZOOM', joinUrl: 'https://zoom.us/j/555', startAt: startAt.toISOString(), durationMin: 30 });
    expect(live.status).toBe(201);
    const jobId = reminderJobId(live.body.session.id, startAt);
    liveJobIds.add(jobId);
    expect(await eventually(() => notifications.getJob(jobId), (j) => !!j)).toBeTruthy();

    const row = await prisma.homework.findUniqueOrThrow({
      where: { id: hwId },
      select: { attachmentKey: true, submissions: { select: { fileKey: true } } },
    });
    const keys = [row.attachmentKey!, ...row.submissions.map((s) => s.fileKey)];
    expect(keys).toHaveLength(2);
    for (const k of keys) {
      const o = await storage.open(k);
      expect(o).not.toBeNull();
      o!.stream.destroy();
    }

    expect((await request(app).delete(`/api/admin/courses/${course.id}`).set(auth(adminToken))).status).toBe(200);
    expect(await prisma.homework.count({ where: { id: hwId } })).toBe(0);
    for (const k of keys) expect(await storage.open(k)).toBeNull();
    expect(await eventually(() => notifications.getJob(jobId), (j) => !j)).toBeFalsy();
  });
});

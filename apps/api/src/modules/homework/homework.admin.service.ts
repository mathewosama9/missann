import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import {
  UPLOAD_LIMITS,
  type AdminHomeworkDTO,
  type AdminHomeworkFilter,
  type AdminSubmissionDTO,
  type AdminSubmissionsFilter,
  type GradeSubmissionInput,
  type HomeworkCreateInput,
  type HomeworkUpdateInput,
} from '@miss-ann/shared';
import { prisma } from '../../lib/prisma.js';
import { badRequest, conflict, notFound, paginate } from '../../lib/http.js';
import { auditTx } from '../../lib/audit.js';
import { normalizeDocOrImage, safeDisplayName } from '../../lib/uploads.js';
import { newStorageKey, privateStorage, removeQuietly } from '../../lib/storage.js';
import { isLateSubmission } from './homework.service.js';

// ── إدارة الواجبات والتصحيح (أدمن + مساعد) — كل كتابة في AuditLog داخل نفس المعاملة ─

const hwNotFound = () => notFound('الواجب غير موجود');

const adminSelect = {
  id: true,
  title: true,
  description: true,
  courseId: true,
  lessonId: true,
  dueAt: true,
  maxGrade: true,
  attachmentName: true,
  attachmentMime: true,
  createdAt: true,
  course: { select: { title: true } },
  lesson: { select: { title: true } },
  _count: { select: { submissions: true } },
} satisfies Prisma.HomeworkSelect;
type AdminRow = Prisma.HomeworkGetPayload<{ select: typeof adminSelect }>;

function toAdminDTO(h: AdminRow, gradedCount: number): AdminHomeworkDTO {
  return {
    id: h.id,
    title: h.title,
    description: h.description,
    courseId: h.courseId,
    courseTitle: h.course.title,
    lessonId: h.lessonId,
    lessonTitle: h.lesson?.title ?? null,
    dueAt: h.dueAt?.toISOString() ?? null,
    maxGrade: h.maxGrade,
    attachment: h.attachmentName && h.attachmentMime ? { name: h.attachmentName, mime: h.attachmentMime } : null,
    submissionsCount: h._count.submissions,
    gradedCount,
    createdAt: h.createdAt.toISOString(),
  };
}

// عدد المصحَّح لكل واجب في الصفحة باستعلام واحد (بلا N+1)
async function gradedCounts(ids: number[]): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.homeworkSubmission.groupBy({
    by: ['homeworkId'],
    where: { homeworkId: { in: ids }, gradedAt: { not: null } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.homeworkId, r._count._all]));
}

export async function listHomework(f: AdminHomeworkFilter) {
  const where: Prisma.HomeworkWhereInput = {
    ...(f.courseId && { courseId: f.courseId }),
    ...(f.q && { title: { contains: f.q, mode: 'insensitive' } }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.homework.findMany({
      where,
      select: adminSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
    prisma.homework.count({ where }),
  ]);
  const graded = await gradedCounts(rows.map((r) => r.id));
  return paginate(
    rows.map((r) => toAdminDTO(r, graded.get(r.id) ?? 0)),
    total,
    f.page,
    f.pageSize,
  );
}

export async function getHomework(id: number): Promise<AdminHomeworkDTO> {
  const h = await prisma.homework.findUnique({ where: { id }, select: adminSelect });
  if (!h) throw hwNotFound();
  const graded = await gradedCounts([id]);
  return toAdminDTO(h, graded.get(id) ?? 0);
}

// الحصة المختارة يجب أن تتبع كورس الواجب نفسه
async function assertLessonInCourse(lessonId: number | null | undefined, courseId: number): Promise<void> {
  if (!lessonId) return;
  const lesson = await prisma.lesson.findFirst({ where: { id: lessonId, courseId }, select: { id: true } });
  if (!lesson) throw badRequest('الحصة لا تتبع هذا الكورس', { lessonId: 'الحصة لا تتبع هذا الكورس' });
}

export async function createHomework(req: Request, input: HomeworkCreateInput): Promise<AdminHomeworkDTO> {
  const course = await prisma.course.findUnique({ where: { id: input.courseId }, select: { id: true } });
  if (!course) throw badRequest('الكورس غير موجود', { courseId: 'الكورس غير موجود' });
  await assertLessonInCourse(input.lessonId, input.courseId);
  const hw = await prisma.$transaction(async (tx) => {
    const h = await tx.homework.create({ data: { ...input, lessonId: input.lessonId ?? null }, select: { id: true, title: true } });
    await auditTx(tx, req, 'HOMEWORK_CREATE', 'Homework', { homeworkId: h.id, courseId: input.courseId, title: h.title });
    return h;
  });
  return getHomework(hw.id);
}

export async function updateHomework(req: Request, id: number, input: HomeworkUpdateInput): Promise<AdminHomeworkDTO> {
  const current = await prisma.homework.findUnique({ where: { id }, select: { courseId: true } });
  if (!current) throw hwNotFound();
  await assertLessonInCourse(input.lessonId, current.courseId);
  await prisma.$transaction(async (tx) => {
    if (input.maxGrade !== undefined) {
      // قفل صف الواجب يسلسل هذا الفحص مع التصحيح (FOR SHARE هناك) — بدونه تصحيح متزامن يمرّ بدرجة > النهائية
      const [locked] = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "Homework" WHERE id = ${id} FOR NO KEY UPDATE`;
      if (!locked) throw hwNotFound();
      // لا تُخفَّض الدرجة النهائية تحت درجة صُحِّحت فعلاً (تصبح الدرجة > النهائية)
      const top = await tx.homeworkSubmission.aggregate({ where: { homeworkId: id }, _max: { grade: true } });
      const maxGiven = top._max.grade ?? 0;
      if (input.maxGrade < maxGiven) {
        throw conflict(`توجد درجة ${maxGiven} مصحَّحة — الدرجة النهائية لا تقل عنها`);
      }
    }
    await tx.homework.update({ where: { id }, data: input });
    await auditTx(tx, req, 'HOMEWORK_UPDATE', 'Homework', { homeworkId: id, fields: Object.keys(input) });
  });
  return getHomework(id);
}

// مفاتيح كل الملفات الخاصة (المرفقات + حلول الطلاب) لواجبات مطابقة — تُجمع داخل معاملة الحذف
// وتُحذف من التخزين بعد نجاح الـ commit فقط. يستخدمها حذف الواجب وحذف الكورس (cascade).
// الأقفال (FOR UPDATE) تمنع تسليماً/مرفقاً يُحفظ بين القراءة والحذف فيضيع ملفه يتيماً: ينتظر الـ commit ثم يفشل (404)
export async function homeworkFileKeys(tx: Prisma.TransactionClient, where: Prisma.HomeworkWhereInput): Promise<string[]> {
  const ids = (await tx.homework.findMany({ where, select: { id: true } })).map((h) => h.id);
  if (ids.length === 0) return [];
  const hws = await tx.$queryRaw<{ attachmentKey: string | null }[]>`
    SELECT "attachmentKey" FROM "Homework" WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
  const subs = await tx.$queryRaw<{ fileKey: string }[]>`
    SELECT "fileKey" FROM "HomeworkSubmission" WHERE "homeworkId" IN (${Prisma.join(ids)}) FOR UPDATE`;
  return [...hws.map((h) => h.attachmentKey), ...subs.map((s) => s.fileKey)].filter((k): k is string => !!k);
}

export const removeFiles = (keys: string[]) => Promise.all(keys.map((k) => removeQuietly(k)));

// حذف الواجب يحذف تسليماته؛ الملفات تُحذف بعد نجاح الـ commit فقط
export async function deleteHomework(req: Request, id: number): Promise<void> {
  const keys = await prisma.$transaction(async (tx) => {
    const h = await tx.homework.findUnique({ where: { id }, select: { title: true, _count: { select: { submissions: true } } } });
    if (!h) throw hwNotFound();
    const fileKeys = await homeworkFileKeys(tx, { id });
    await tx.homework.delete({ where: { id } });
    await auditTx(tx, req, 'HOMEWORK_DELETE', 'Homework', {
      homeworkId: id,
      title: h.title,
      submissions: h._count.submissions,
    });
    return fileKeys;
  });
  await removeFiles(keys);
}

// ── مرفق الواجب (PDF حتى 20MB أو صورة حتى 5MB) ─────────────────────
export async function setAttachment(
  req: Request,
  id: number,
  file: { buffer: Buffer; originalname: string },
): Promise<AdminHomeworkDTO> {
  const exists = await prisma.homework.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw hwNotFound();
  const stored = await normalizeDocOrImage(file.buffer, {
    pdfMaxBytes: UPLOAD_LIMITS.pdfMaxBytes,
    imageMaxBytes: UPLOAD_LIMITS.imageMaxBytes,
  });
  const key = newStorageKey('homework', stored.ext);
  await privateStorage.put(key, stored.data);
  const name = safeDisplayName(file.originalname, stored.ext);
  let oldKey: string | null;
  try {
    oldKey = await prisma.$transaction(async (tx) => {
      const [cur] = await tx.$queryRaw<{ attachmentKey: string | null }[]>`
        SELECT "attachmentKey" FROM "Homework" WHERE id = ${id} FOR UPDATE`;
      if (!cur) throw hwNotFound();
      await tx.homework.update({
        where: { id },
        data: { attachmentKey: key, attachmentMime: stored.mime, attachmentName: name },
      });
      await auditTx(tx, req, 'HOMEWORK_ATTACHMENT_SET', 'Homework', { homeworkId: id, mime: stored.mime, bytes: stored.data.length });
      return cur.attachmentKey;
    });
  } catch (err) {
    await removeQuietly(key);
    throw err;
  }
  await removeQuietly(oldKey);
  return getHomework(id);
}

export async function removeAttachment(req: Request, id: number): Promise<AdminHomeworkDTO> {
  const oldKey = await prisma.$transaction(async (tx) => {
    const [cur] = await tx.$queryRaw<{ attachmentKey: string | null }[]>`
      SELECT "attachmentKey" FROM "Homework" WHERE id = ${id} FOR UPDATE`;
    if (!cur) throw hwNotFound();
    if (!cur.attachmentKey) return null;
    await tx.homework.update({ where: { id }, data: { attachmentKey: null, attachmentMime: null, attachmentName: null } });
    await auditTx(tx, req, 'HOMEWORK_ATTACHMENT_REMOVE', 'Homework', { homeworkId: id });
    return cur.attachmentKey;
  });
  await removeQuietly(oldKey);
  return getHomework(id);
}

// ── التسليمات والتصحيح ───────────────────────────────────────────
const submissionRowSelect = {
  id: true,
  fileName: true,
  fileMime: true,
  fileSize: true,
  submittedAt: true,
  grade: true,
  feedback: true,
  gradedAt: true,
  user: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.HomeworkSubmissionSelect;
type SubmissionRow = Prisma.HomeworkSubmissionGetPayload<{ select: typeof submissionRowSelect }>;

const toSubmissionRow = (s: SubmissionRow, dueAt: Date | null): AdminSubmissionDTO => ({
  id: s.id,
  user: s.user,
  fileName: s.fileName,
  fileMime: s.fileMime,
  fileSize: s.fileSize,
  submittedAt: s.submittedAt.toISOString(),
  isLate: isLateSubmission(s.submittedAt, dueAt),
  grade: s.grade,
  feedback: s.feedback,
  gradedAt: s.gradedAt?.toISOString() ?? null,
});

export async function listSubmissions(homeworkId: number, f: AdminSubmissionsFilter) {
  const hw = await prisma.homework.findUnique({ where: { id: homeworkId }, select: { dueAt: true } });
  if (!hw) throw hwNotFound();
  const where: Prisma.HomeworkSubmissionWhereInput = {
    homeworkId,
    ...(f.status === 'PENDING' && { gradedAt: null }),
    ...(f.status === 'GRADED' && { gradedAt: { not: null } }),
  };
  // طابور التصحيح: الأقدم أولاً؛ غير ذلك الأحدث أولاً
  const orderBy: Prisma.HomeworkSubmissionOrderByWithRelationInput[] =
    f.status === 'PENDING' ? [{ submittedAt: 'asc' }, { id: 'asc' }] : [{ submittedAt: 'desc' }, { id: 'desc' }];
  const [rows, total] = await prisma.$transaction([
    prisma.homeworkSubmission.findMany({
      where,
      select: submissionRowSelect,
      orderBy,
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
    prisma.homeworkSubmission.count({ where }),
  ]);
  return paginate(
    rows.map((s) => toSubmissionRow(s, hw.dueAt)),
    total,
    f.page,
    f.pageSize,
  );
}

// التصحيح (وإعادة التصحيح): 0..maxGrade، gradedAt = الآن، وسجل تدقيق بالقيمة السابقة.
// التحديث مشروط بنسخة الحل التي رأتها المس (submittedAt) — ذرّي ضد استبدال الطالب لملفه في نفس اللحظة
export async function gradeSubmission(
  req: Request,
  homeworkId: number,
  submissionId: number,
  input: GradeSubmissionInput,
): Promise<AdminSubmissionDTO> {
  return prisma.$transaction(async (tx) => {
    // FOR SHARE: maxGrade لا يتغيّر حتى نهاية المعاملة (تعديل الواجب ينتظر)، والمصحّحون المتزامنون لا يحجب بعضهم بعضاً
    const [hw] = await tx.$queryRaw<{ maxGrade: number; dueAt: Date | null }[]>`
      SELECT "maxGrade", "dueAt" FROM "Homework" WHERE id = ${homeworkId} FOR SHARE`;
    const s = await tx.homeworkSubmission.findFirst({
      where: { id: submissionId, homeworkId },
      select: { userId: true, grade: true },
    });
    if (!hw || !s) throw notFound('التسليم غير موجود');
    if (input.grade > hw.maxGrade) {
      throw badRequest(`الدرجة من 0 إلى ${hw.maxGrade}`, { grade: `الحد الأقصى ${hw.maxGrade}` });
    }
    const { count } = await tx.homeworkSubmission.updateMany({
      where: { id: submissionId, submittedAt: input.submittedAt },
      data: { grade: input.grade, feedback: input.feedback, gradedAt: new Date() },
    });
    if (count === 0) throw conflict('الطالب رفع ملفاً جديداً بعد فتحك للحل — راجعي الملف الجديد ثم صحّحي');
    const updated = await tx.homeworkSubmission.findUniqueOrThrow({ where: { id: submissionId }, select: submissionRowSelect });
    await auditTx(tx, req, 'HOMEWORK_GRADE', 'HomeworkSubmission', {
      homeworkId,
      submissionId,
      studentId: s.userId,
      grade: input.grade,
      previousGrade: s.grade,
    });
    return toSubmissionRow(updated, hw.dueAt);
  });
}

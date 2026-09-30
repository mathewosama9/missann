import { Prisma } from '@prisma/client';
import {
  HOMEWORK_POLICY,
  UPLOAD_LIMITS,
  type HomeworkItemDTO,
  type HomeworkListDTO,
  type HomeworkListFilter,
  type HomeworkStatus,
  type HomeworkSubmissionDTO,
  type JwtPayload,
} from '@miss-ann/shared';
import { LOCKED_TX, prisma } from '../../lib/prisma.js';
import { conflict, notFound, paginate } from '../../lib/http.js';
import { normalizeDocOrImage, safeDisplayName } from '../../lib/uploads.js';
import { newStorageKey, privateStorage, removeQuietly } from '../../lib/storage.js';
import { isEnrolled } from '../courses/enrollment.service.js';

// ── واجبات الطالب ────────────────────────────────────────────────
// الوصول: اشتراك ساري في كورس الواجب. غير المشترك يرى 404 (لا نكشف وجود الواجب).
// سياسة التسليم (HOMEWORK_POLICY): استبدال الملف مسموح حتى التصحيح؛ المتأخر مقبول ويُعلَّم.

const hwNotFound = () => notFound('الواجب غير موجود');
const gradedLocked = () => conflict('تم تصحيح الواجب — لا يمكن تغيير التسليم');
const lateClosed = () => conflict('انتهى موعد تسليم هذا الواجب');

const activeCourse = (userId: number, now: Date): Prisma.CourseWhereInput => ({
  enrollments: { some: { userId, expiresAt: { gt: now } } },
});

export const submissionSelect = {
  id: true,
  fileName: true,
  fileMime: true,
  fileSize: true,
  submittedAt: true,
  grade: true,
  feedback: true,
  gradedAt: true,
} satisfies Prisma.HomeworkSubmissionSelect;
type SubmissionRow = Prisma.HomeworkSubmissionGetPayload<{ select: typeof submissionSelect }>;

const itemSelect = (userId: number) =>
  ({
    id: true,
    title: true,
    description: true,
    courseId: true,
    lessonId: true,
    dueAt: true,
    maxGrade: true,
    attachmentName: true,
    attachmentMime: true,
    course: { select: { title: true } },
    lesson: { select: { title: true } },
    submissions: { where: { userId }, select: submissionSelect, take: 1 },
  }) satisfies Prisma.HomeworkSelect;
type ItemRow = Prisma.HomeworkGetPayload<{ select: ReturnType<typeof itemSelect> }>;

const pastDue = (dueAt: Date | null, now: Date) => dueAt !== null && now > dueAt;

export const isLateSubmission = (submittedAt: Date, dueAt: Date | null) => dueAt !== null && submittedAt > dueAt;

function canSubmit(dueAt: Date | null, sub: { gradedAt: Date | null } | null, now: Date): boolean {
  if (sub?.gradedAt) return false;
  if (sub && !HOMEWORK_POLICY.resubmitUntilGraded) return false;
  return HOMEWORK_POLICY.allowLate || !pastDue(dueAt, now);
}

export function toSubmissionDTO(s: SubmissionRow, dueAt: Date | null, now = new Date()): HomeworkSubmissionDTO {
  return {
    id: s.id,
    fileName: s.fileName,
    fileMime: s.fileMime,
    fileSize: s.fileSize,
    submittedAt: s.submittedAt.toISOString(),
    isLate: isLateSubmission(s.submittedAt, dueAt),
    grade: s.grade,
    feedback: s.feedback,
    gradedAt: s.gradedAt?.toISOString() ?? null,
    canResubmit: canSubmit(dueAt, s, now),
  };
}

function toItem(h: ItemRow, now: Date): HomeworkItemDTO {
  const sub = h.submissions[0] ?? null;
  let status: HomeworkStatus;
  if (sub) status = sub.gradedAt ? 'GRADED' : 'SUBMITTED';
  else status = pastDue(h.dueAt, now) ? 'LATE' : 'REQUIRED';
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
    status,
    submission: sub ? toSubmissionDTO(sub, h.dueAt, now) : null,
  };
}

// ── GET /api/homework?tab= ───────────────────────────────────────
export async function listForStudent(userId: number, f: HomeworkListFilter): Promise<HomeworkListDTO> {
  const now = new Date();
  const base: Prisma.HomeworkWhereInput = { course: activeCourse(userId, now) };
  const byTab = {
    REQUIRED: { ...base, submissions: { none: { userId } } },
    SUBMITTED: { ...base, submissions: { some: { userId, gradedAt: null } } },
    GRADED: { ...base, submissions: { some: { userId, gradedAt: { not: null } } } },
  } satisfies Record<HomeworkListFilter['tab'], Prisma.HomeworkWhereInput>;

  // المطلوب: الأقرب موعداً أولاً (بلا موعد في الآخر)؛ المسلَّم/المصحَّح: الأحدث أولاً
  const orderBy: Prisma.HomeworkOrderByWithRelationInput[] =
    f.tab === 'REQUIRED' ? [{ dueAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'desc' }];

  const [rows, required, submitted, graded] = await prisma.$transaction([
    prisma.homework.findMany({
      where: byTab[f.tab],
      select: itemSelect(userId),
      orderBy,
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
    prisma.homework.count({ where: byTab.REQUIRED }),
    prisma.homework.count({ where: byTab.SUBMITTED }),
    prisma.homework.count({ where: byTab.GRADED }),
  ]);
  const counts = { REQUIRED: required, SUBMITTED: submitted, GRADED: graded };
  return {
    ...paginate(
      rows.map((r) => toItem(r, now)),
      counts[f.tab],
      f.page,
      f.pageSize,
    ),
    counts,
  };
}

async function findForStudent(userId: number, homeworkId: number, now = new Date()) {
  const h = await prisma.homework.findFirst({
    where: { id: homeworkId, course: activeCourse(userId, now) },
    select: itemSelect(userId),
  });
  if (!h) throw hwNotFound();
  return h;
}

// ── GET /api/homework/:id/submission ─────────────────────────────
export async function getOwnSubmission(userId: number, homeworkId: number): Promise<HomeworkSubmissionDTO | null> {
  const now = new Date();
  const h = await findForStudent(userId, homeworkId, now);
  const sub = h.submissions[0];
  return sub ? toSubmissionDTO(sub, h.dueAt, now) : null;
}

// فحص قبل استقبال الملف: لا نحمّل 15MB في الذاكرة لطلب سيُرفض على أي حال
export async function assertCanSubmit(userId: number, homeworkId: number): Promise<void> {
  const now = new Date();
  const h = await findForStudent(userId, homeworkId, now);
  const sub = h.submissions[0] ?? null;
  if (sub?.gradedAt) throw gradedLocked();
  if (!canSubmit(h.dueAt, sub, now)) throw sub ? conflict('لا يمكن تغيير التسليم') : lateClosed();
}

// ── POST /api/homework/:id/submit ────────────────────────────────
// الترتيب يضمن عدم ضياع عمل الطالب: تخزين الملف الجديد ← تحديث الصف (قفل FOR UPDATE) ← حذف القديم.
// أي فشل قبل الـ commit يحذف الملف الجديد ويُبقي القديم كما هو.
export async function submit(
  userId: number,
  homeworkId: number,
  file: { buffer: Buffer; originalname: string },
): Promise<HomeworkSubmissionDTO> {
  const h = await findForStudent(userId, homeworkId);
  const stored = await normalizeDocOrImage(file.buffer, {
    pdfMaxBytes: UPLOAD_LIMITS.homeworkMaxBytes,
    imageMaxBytes: UPLOAD_LIMITS.homeworkMaxBytes,
  });
  const key = newStorageKey('submissions', stored.ext);
  await privateStorage.put(key, stored.data);

  const data = {
    fileKey: key,
    fileMime: stored.mime,
    fileName: safeDisplayName(file.originalname, stored.ext),
    fileSize: stored.data.length,
  };
  let result: { sub: SubmissionRow; oldKey: string | null };
  try {
    result = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const [cur] = await tx.$queryRaw<{ id: number; fileKey: string; gradedAt: Date | null }[]>`
        SELECT id, "fileKey", "gradedAt" FROM "HomeworkSubmission"
        WHERE "homeworkId" = ${homeworkId} AND "userId" = ${userId}
        FOR UPDATE`;
      if (!canSubmit(h.dueAt, cur ?? null, now)) throw cur?.gradedAt ? gradedLocked() : lateClosed();
      if (!cur) {
        const sub = await tx.homeworkSubmission.create({
          data: { homeworkId, userId, ...data, submittedAt: now },
          select: submissionSelect,
        });
        return { sub, oldKey: null };
      }
      const sub = await tx.homeworkSubmission.update({
        where: { id: cur.id },
        data: { ...data, submittedAt: now },
        select: submissionSelect,
      });
      return { sub, oldKey: cur.fileKey };
    }, LOCKED_TX);
  } catch (err) {
    await removeQuietly(key);
    // تسليمان أولان متزامنان: الثاني يصطدم بالقيد الفريد — لم يُفقد شيء
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict('وصل تسليم آخر في نفس اللحظة — حدّث الصفحة وحاول مرة أخرى');
    }
    // الواجب (أو كورسه) حُذف أثناء الرفع
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') throw hwNotFound();
    throw err;
  }
  await removeQuietly(result.oldKey);
  return toSubmissionDTO(result.sub, h.dueAt);
}

// ── ملفات خاصة: المالك (بتسجيل ساري) أو فريق العمل فقط؛ غيرهم 404 حتى لو المعرّف موجود ─
const isStaff = (u: JwtPayload) => u.role === 'ADMIN' || u.role === 'ASSISTANT';

export async function submissionFileFor(user: JwtPayload, submissionId: number) {
  const s = await prisma.homeworkSubmission.findUnique({
    where: { id: submissionId },
    select: { userId: true, fileKey: true, fileMime: true, fileName: true, homework: { select: { courseId: true } } },
  });
  if (!s) throw notFound('الملف غير موجود');
  if (!isStaff(user) && (s.userId !== user.sub || !(await isEnrolled(user.sub, s.homework.courseId)))) {
    throw notFound('الملف غير موجود');
  }
  return { key: s.fileKey, mime: s.fileMime, name: s.fileName };
}

export async function attachmentFileFor(user: JwtPayload, homeworkId: number) {
  const h = await prisma.homework.findUnique({
    where: { id: homeworkId },
    select: { courseId: true, attachmentKey: true, attachmentMime: true, attachmentName: true },
  });
  if (!h?.attachmentKey || !h.attachmentMime || !h.attachmentName) throw notFound('الملف غير موجود');
  if (!isStaff(user) && !(await isEnrolled(user.sub, h.courseId))) throw notFound('الملف غير موجود');
  return { key: h.attachmentKey, mime: h.attachmentMime, name: h.attachmentName };
}

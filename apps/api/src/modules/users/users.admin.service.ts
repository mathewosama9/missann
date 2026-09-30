import crypto from 'node:crypto';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import {
  TEMP_PASSWORD_LENGTH,
  type AdminStudentDetailDTO,
  type AdminStudentListItemDTO,
  type AdminStudentsFilter,
  type Paginated,
  type Role,
  type StaffCreateInput,
  type StaffDTO,
  type TempPasswordDTO,
} from '@miss-ann/shared';
import { prisma } from '../../lib/prisma.js';
import { conflict, notFound, paginate } from '../../lib/http.js';
import { auditTx } from '../../lib/audit.js';
import { hashPassword } from '../../lib/password.js';
// إنهاء الجلسات (تعطيل / كلمة مرور جديدة / إزالة جهاز): التحديث والوصول معاً — الدخول من جديد مطلوب
import { forgetUserStatus, revokeSessions } from '../../lib/userStatus.js';

// ── إدارة الحسابات (أدمن فقط): الطلاب والمساعدون ─────────────────────
// كل كتابة: قفل صف المستخدم + التدقيق في نفس المعاملة. passwordHash لا يُقرأ أبداً هنا (select صريح).

type Tx = Prisma.TransactionClient;

// أحرف واضحة بلا التباس (لا 0/O ولا 1/l/I) — تُملى على الطالب بالتليفون
const TEMP_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const tempPassword = (): string =>
  Array.from({ length: TEMP_PASSWORD_LENGTH }, () => TEMP_ALPHABET[crypto.randomInt(TEMP_ALPHABET.length)]).join('');

const accountNotFound = (roles: readonly Role[]) => notFound(roles.includes('STUDENT') ? 'الطالب غير موجود' : 'الحساب غير موجود');

// قفل صف المستخدم (يسلسل العمليات المتزامنة على نفس الحساب) — دور آخر ← 404 كغير الموجود
async function lockUser(tx: Tx, id: number, roles: readonly Role[]) {
  const [u] = await tx.$queryRaw<{ id: number; role: Role; isActive: boolean }[]>`
    SELECT "id", "role", "isActive" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
  if (!u || !roles.includes(u.role)) throw accountNotFound(roles);
  return u;
}

// ── الطلاب ──────────────────────────────────────────────────────
const studentSelect = (now: Date) =>
  ({
    id: true,
    name: true,
    phone: true,
    parentPhone: true,
    grade: true,
    governorate: true,
    isActive: true,
    createdAt: true,
    wallet: { select: { balance: true } },
    _count: { select: { enrollments: { where: { expiresAt: { gt: now } } } } },
  }) satisfies Prisma.UserSelect;

type StudentRow = Prisma.UserGetPayload<{ select: ReturnType<typeof studentSelect> }>;

function toStudentItem(u: StudentRow): AdminStudentListItemDTO {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    parentPhone: u.parentPhone,
    grade: u.grade,
    governorate: u.governorate,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    balance: u.wallet?.balance ?? 0,
    activeEnrollments: u._count.enrollments,
  };
}

// البحث بجزء من الاسم أو الموبايل (فهارس GIN trigram)، والترتيب الأحدث أولاً
export async function listStudents(f: AdminStudentsFilter): Promise<Paginated<AdminStudentListItemDTO>> {
  const now = new Date();
  const where: Prisma.UserWhereInput = {
    role: 'STUDENT',
    ...(f.grade && { grade: f.grade }),
    ...(f.status && { isActive: f.status === 'active' }),
    ...(f.q && { OR: [{ name: { contains: f.q, mode: 'insensitive' } }, { phone: { contains: f.q } }] }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.user.findMany({ where, select: studentSelect(now), orderBy: { id: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    prisma.user.count({ where }),
  ]);
  return paginate(rows.map(toStudentItem), total, f.page, f.pageSize);
}

const deviceSelect = { id: true, userAgent: true, ip: true, lastSeen: true, createdAt: true } satisfies Prisma.DeviceSelect;

export async function getStudent(id: number): Promise<AdminStudentDetailDTO> {
  const now = new Date();
  const u = await prisma.user.findFirst({
    where: { id, role: 'STUDENT' },
    select: {
      ...studentSelect(now),
      email: true,
      deviceLimit: true,
      enrollments: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, courseId: true, source: true, createdAt: true, expiresAt: true, course: { select: { title: true } } },
      },
      devices: { orderBy: { lastSeen: 'desc' }, select: deviceSelect },
      examAttempts: {
        where: { status: { not: 'IN_PROGRESS' } },
        orderBy: { id: 'desc' },
        take: 5,
        select: { id: true, examId: true, score: true, totalPoints: true, submittedAt: true, exam: { select: { title: true } } },
      },
    },
  });
  if (!u) throw notFound('الطالب غير موجود');
  const stars = await prisma.lessonProgress.count({ where: { userId: id, completedAt: { not: null } } });
  return {
    ...toStudentItem(u),
    email: u.email,
    deviceLimit: u.deviceLimit,
    stars,
    enrollments: u.enrollments.map((e) => ({
      id: e.id,
      courseId: e.courseId,
      courseTitle: e.course.title,
      source: e.source,
      createdAt: e.createdAt.toISOString(),
      expiresAt: e.expiresAt.toISOString(),
      active: e.expiresAt > now,
    })),
    devices: u.devices.map((d) => ({ ...d, lastSeen: d.lastSeen.toISOString(), createdAt: d.createdAt.toISOString() })),
    recentAttempts: u.examAttempts.map((a) => ({
      id: a.id,
      examId: a.examId,
      examTitle: a.exam.title,
      score: a.score,
      totalPoints: a.totalPoints,
      submittedAt: a.submittedAt?.toISOString() ?? null,
    })),
  };
}

// إزالة جهاز لتحرير مكان في حد الأجهزة. لا يوجد ربط بين الجلسة والجهاز ← تُبطل كل جلسات الطالب
// (الجهاز المفقود/المسروق لا يبقى داخلاً؛ الطالب يدخل من جديد من جهازه الحالي)
export async function removeStudentDevice(req: Request, userId: number, deviceId: number): Promise<{ message: string }> {
  await prisma.$transaction(async (tx) => {
    await lockUser(tx, userId, ['STUDENT']);
    const { count } = await tx.device.deleteMany({ where: { id: deviceId, userId } });
    if (count === 0) throw notFound('الجهاز غير موجود');
    await revokeSessions(tx, userId);
    await auditTx(tx, req, 'USER_DEVICE_REMOVE', 'Device', { userId, deviceId });
  });
  forgetUserStatus(userId);
  return { message: 'تمت إزالة الجهاز وتسجيل خروج الطالب من كل الأجهزة' };
}

// ── مشترك: تفعيل/تعطيل وإعادة تعيين كلمة المرور (الدور المسموح يحدده المسار) ──
export async function setUserActive(req: Request, id: number, isActive: boolean, roles: readonly Role[]): Promise<{ id: number; isActive: boolean }> {
  await prisma.$transaction(async (tx) => {
    const u = await lockUser(tx, id, roles);
    if (u.isActive === isActive) return; // لا تغيير ← لا تدقيق مكرر
    await tx.user.update({ where: { id }, data: { isActive } });
    // التعطيل يُنهي الجلسات فوراً (التجديد يرفض المعطَّل أيضاً)
    if (!isActive) await revokeSessions(tx, id);
    await auditTx(tx, req, isActive ? 'USER_ACTIVATE' : 'USER_DEACTIVATE', 'User', { userId: id, role: u.role });
  });
  // بعد الـ commit: الطلب التالي بتوكنه الحالي يُفحص من القاعدة (التعطيل فوري)
  forgetUserStatus(id);
  return { id, isActive };
}

// كلمة مرور مؤقتة عشوائية تُعرض مرة واحدة (لا تُخزَّن نصاً ولا تُسجَّل) + إنهاء كل الجلسات
export async function resetUserPassword(req: Request, id: number, roles: readonly Role[]): Promise<TempPasswordDTO> {
  const password = tempPassword();
  const passwordHash = await hashPassword(password); // خارج المعاملة: argon2 بطيء عمداً
  await prisma.$transaction(async (tx) => {
    await lockUser(tx, id, roles);
    await tx.user.update({ where: { id }, data: { passwordHash } });
    await revokeSessions(tx, id);
    await auditTx(tx, req, 'USER_PASSWORD_RESET', 'User', { userId: id });
  });
  forgetUserStatus(id);
  return { userId: id, tempPassword: password };
}

// ── المساعدون ────────────────────────────────────────────────────
const staffSelect = { id: true, name: true, phone: true, email: true, role: true, isActive: true, createdAt: true } satisfies Prisma.UserSelect;
const toStaffDTO = (u: Prisma.UserGetPayload<{ select: typeof staffSelect }>): StaffDTO => ({ ...u, createdAt: u.createdAt.toISOString() });

// فريق العمل عدد صغير ← القائمة كاملة (بحد أعلى)
export async function listStaff(): Promise<StaffDTO[]> {
  const rows = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'ASSISTANT'] } },
    select: staffSelect,
    orderBy: [{ role: 'desc' }, { id: 'asc' }],
    take: 200,
  });
  return rows.map(toStaffDTO);
}

export async function createAssistant(req: Request, input: StaffCreateInput): Promise<{ staff: StaffDTO; tempPassword: string }> {
  const password = tempPassword();
  const passwordHash = await hashPassword(password);
  try {
    const u = await prisma.$transaction(async (tx) => {
      const row = await tx.user.create({
        data: { name: input.name, phone: input.phone, email: input.email ?? null, passwordHash, role: 'ASSISTANT', isActive: true, parentPhone: '' },
        select: staffSelect,
      });
      await auditTx(tx, req, 'STAFF_CREATE', 'User', { userId: row.id, role: row.role });
      return row;
    });
    return { staff: toStaffDTO(u), tempPassword: password };
  } catch (err) {
    // الفريد على الموبايل/البريد هو الحَكَم (لا سباق بين فحص وإنشاء)
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const field = String((err.meta?.target as string[] | undefined)?.join(',') ?? '');
      throw conflict(field.includes('email') ? 'البريد الإلكتروني مسجّل بالفعل' : 'رقم الموبايل مسجّل بالفعل');
    }
    throw err;
  }
}

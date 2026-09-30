import type { Request } from 'express';
import type {
  AdminEnrollInput,
  AdminEnrollResultDTO,
  AdminPaymentDTO,
  AdminPaymentsFilter,
  AdminTopupInput,
} from '@miss-ann/shared';
import { LOCKED_TX, prisma } from '../../lib/prisma.js';
import { notFound, paginate } from '../../lib/http.js';
import { auditTx } from '../../lib/audit.js';
import { creditWallet, lockWallet } from '../wallet/wallet.service.js';
import { grantEnrollment } from '../courses/enrollment.service.js';
import { toPaymentDTO } from './payments.service.js';

export async function listPayments(filter: AdminPaymentsFilter) {
  const where = {
    ...(filter.status && { status: filter.status }),
    ...(filter.purpose && { purpose: filter.purpose }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      include: {
        course: { select: { title: true } },
        user: { select: { id: true, name: true, phone: true } },
      },
    }),
    prisma.payment.count({ where }),
  ]);
  const items: AdminPaymentDTO[] = rows.map((p) => ({
    ...toPaymentDTO(p),
    provider: p.provider,
    providerRef: p.providerRef,
    user: p.user,
  }));
  return paginate(items, total, filter.page, filter.pageSize);
}

// بحث طالب بالموبايل قبل أي عملية يدوية (لتأكيد الاسم والرصيد)
export async function lookupStudent(phone: string) {
  const user = await prisma.user.findUnique({
    where: { phone },
    select: { id: true, name: true, phone: true, role: true, wallet: { select: { balance: true } } },
  });
  if (!user || user.role !== 'STUDENT') throw notFound('لا يوجد طالب بهذا الرقم');
  return { id: user.id, name: user.name, phone: user.phone, balance: user.wallet?.balance ?? 0 };
}

// ── شحن يدوي (source=ADMIN) ─────────────────────────────────────
export async function manualTopup(req: Request, input: AdminTopupInput) {
  const student = await lookupStudent(input.phone);
  return prisma.$transaction(async (tx) => {
    const wallet = await lockWallet(tx, student.id);
    const balance = await creditWallet(
      tx,
      wallet.id,
      input.amount,
      'TOPUP',
      `admin:${req.user!.sub}`,
      `شحن من الإدارة: ${input.note}`,
    );
    await auditTx(tx, req, 'ADMIN_WALLET_TOPUP', 'Wallet', {
      userId: student.id,
      amount: input.amount,
      note: input.note,
      balance,
    });
    return { userId: student.id, balance };
  }, LOCKED_TX);
}

// ── اشتراك يدوي (source=ADMIN) — يمدّد الاشتراك الساري إن وُجد ──────
export async function manualEnroll(req: Request, input: AdminEnrollInput): Promise<AdminEnrollResultDTO> {
  const student = await lookupStudent(input.phone);
  const course = await prisma.course.findUnique({
    where: { id: input.courseId },
    select: { id: true, type: true, title: true },
  });
  if (!course) throw notFound('الكورس غير موجود');

  return prisma.$transaction(async (tx) => {
    await lockWallet(tx, student.id); // تسلسل مع أي اشتراك/دفع متزامن لنفس الطالب
    const enrollment = await grantEnrollment(tx, student.id, course, 'ADMIN');
    await auditTx(tx, req, 'ADMIN_ENROLL', 'Enrollment', {
      userId: student.id,
      courseId: course.id,
      note: input.note,
      expiresAt: enrollment.expiresAt.toISOString(),
    });
    return {
      userId: student.id,
      courseId: course.id,
      source: 'ADMIN',
      expiresAt: enrollment.expiresAt.toISOString(),
    };
  }, LOCKED_TX);
}

import crypto from 'node:crypto';
import type { Request } from 'express';
import type { CodeStatus } from '@prisma/client';
import {
  REDEEM_CODE_ALPHABET,
  REDEEM_CODE_LENGTH,
  formatRedeemCode,
  type AdminCodeDTO,
  type AdminCodesFilter,
  type CodeBatchCreatedDTO,
  type CodeBatchDTO,
  type CodeBatchInput,
} from '@miss-ann/shared';
import { LOCKED_TX, prisma } from '../../lib/prisma.js';
import { conflict, notFound, paginate } from '../../lib/http.js';
import { auditTx, audit } from '../../lib/audit.js';
import { hashRedeemCode } from '../wallet/wallet.service.js';

// كود عشوائي من مصدر تشفيري (randomInt بلا انحياز)
function randomCode(): string {
  let out = '';
  for (let i = 0; i < REDEEM_CODE_LENGTH; i++) {
    out += REDEEM_CODE_ALPHABET[crypto.randomInt(REDEEM_CODE_ALPHABET.length)];
  }
  return out;
}

// ── توليد دفعة: تُخزَّن الأكواد مجزّأة فقط، والنصوص الخام تُرجع مرة واحدة للتصدير ─
export async function createBatch(req: Request, input: CodeBatchInput): Promise<CodeBatchCreatedDTO> {
  const codes = new Set<string>();
  while (codes.size < input.count) codes.add(randomCode());
  const raw = [...codes];

  const batch = await prisma.$transaction(async (tx) => {
    const b = await tx.codeBatch.create({
      data: { label: input.label, value: input.value, count: input.count, createdBy: req.user!.sub },
    });
    await tx.redeemCode.createMany({
      data: raw.map((c) => ({
        codeHash: hashRedeemCode(c),
        codeHint: c.slice(-4),
        value: input.value,
        batchId: b.id,
      })),
    });
    // السجل يحتوي العدد والقيمة فقط — لا أكواد
    await auditTx(tx, req, 'CODE_BATCH_CREATE', 'CodeBatch', {
      batchId: b.id,
      count: input.count,
      value: input.value,
    });
    return b;
  }, LOCKED_TX); // حتى 5000 صف في دفعة واحدة

  const [dto] = await decorateBatches([batch]);
  return { batch: dto!, codes: raw.map(formatRedeemCode) };
}

export async function listBatches(page: number, pageSize: number) {
  const [rows, total] = await prisma.$transaction([
    prisma.codeBatch.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.codeBatch.count(),
  ]);
  return paginate(await decorateBatches(rows), total, page, pageSize);
}

export async function listCodes(filter: AdminCodesFilter) {
  const where = {
    ...(filter.status && { status: filter.status }),
    ...(filter.batchId && { batchId: filter.batchId }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.redeemCode.findMany({
      where,
      orderBy: [{ usedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      include: {
        batch: { select: { label: true } },
        usedBy: { select: { id: true, name: true, phone: true } },
      },
    }),
    prisma.redeemCode.count({ where }),
  ]);
  const items: AdminCodeDTO[] = rows.map((c) => ({
    id: c.id,
    codeHint: c.codeHint,
    value: c.value,
    status: c.status,
    batchId: c.batchId,
    batchLabel: c.batch.label,
    usedBy: c.usedBy,
    usedAt: c.usedAt ? c.usedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  }));
  return paginate(items, total, filter.page, filter.pageSize);
}

// تعطيل كود متاح فقط (المستخدم لا يُعطَّل — الرصيد أُضيف بالفعل)
export async function disableCode(req: Request, id: number): Promise<void> {
  const { count } = await prisma.redeemCode.updateMany({
    where: { id, status: 'ACTIVE' },
    data: { status: 'DISABLED' },
  });
  if (count === 0) {
    const exists = await prisma.redeemCode.findUnique({ where: { id }, select: { status: true } });
    if (!exists) throw notFound('الكود غير موجود');
    throw conflict(exists.status === 'USED' ? 'لا يمكن تعطيل كود مستخدم' : 'الكود معطّل بالفعل');
  }
  await audit(req, 'CODE_DISABLE', 'RedeemCode', { codeId: id });
}

async function decorateBatches(
  rows: { id: number; label: string; value: number; count: number; createdBy: number; createdAt: Date }[],
): Promise<CodeBatchDTO[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((b) => b.id);
  const [groups, creators] = await Promise.all([
    prisma.redeemCode.groupBy({ by: ['batchId', 'status'], where: { batchId: { in: ids } }, _count: { _all: true } }),
    prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((b) => b.createdBy))] } },
      select: { id: true, name: true },
    }),
  ]);
  return rows.map((b) => {
    const stats: Record<CodeStatus, number> = { ACTIVE: 0, USED: 0, DISABLED: 0 };
    for (const g of groups) if (g.batchId === b.id) stats[g.status] = g._count._all;
    return {
      id: b.id,
      label: b.label,
      value: b.value,
      count: b.count,
      createdAt: b.createdAt.toISOString(),
      createdBy: creators.find((u) => u.id === b.createdBy) ?? null,
      stats,
    };
  });
}

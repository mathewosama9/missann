import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

// تسجيل عملية حسّاسة في سجل التدقيق
export async function audit(
  req: Request | null,
  action: string,
  entity: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        actorId: req?.user?.sub ?? null,
        action,
        entity,
        meta: meta ? (meta as object) : undefined,
        ip: req?.ip ?? '',
      },
    })
    .catch(() => undefined);
}

// داخل معاملة مالية: السجل جزء من نفس المعاملة (يُكتب معها أو يُلغى معها)
export async function auditTx(
  tx: Prisma.TransactionClient,
  req: Request | null,
  action: string,
  entity: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: req?.user?.sub ?? null,
      action,
      entity,
      meta: meta ? (meta as object) : undefined,
      ip: req?.ip ?? '',
    },
  });
}

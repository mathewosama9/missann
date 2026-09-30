import crypto from 'node:crypto';
import type { Request } from 'express';
import type { Prisma, WalletTxType } from '@prisma/client';
import type { RedeemResultDTO, WalletDTO, WalletTxDTO } from '@miss-ann/shared';
import { LOCKED_TX, prisma } from '../../lib/prisma.js';
import { AppError, badRequest, conflict } from '../../lib/http.js';
import { audit, auditTx } from '../../lib/audit.js';

// ── دفتر المحفظة: كل حركة رصيد تمر من هنا داخل معاملة ──────────────
// ترتيب الأقفال ثابت: صف المورد (كود/دفعة) أولاً ثم صف المحفظة ← لا deadlock

type Tx = Prisma.TransactionClient;

export const hashRedeemCode = (normalized: string): string =>
  crypto.createHash('sha256').update(normalized).digest('hex');

// يقفل محفظة المستخدم (FOR UPDATE) وينشئها إن لم توجد؛ كل عمليات مال المستخدم تتسلسل عليه
export async function lockWallet(tx: Tx, userId: number): Promise<{ id: number; balance: number }> {
  await tx.wallet.upsert({ where: { userId }, create: { userId }, update: {} });
  const [wallet] = await tx.$queryRaw<{ id: number; balance: number }[]>`
    SELECT id, balance FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
  return wallet!;
}

export async function creditWallet(
  tx: Tx,
  walletId: number,
  amount: number,
  type: WalletTxType,
  refId: string,
  note: string,
): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) throw badRequest('مبلغ غير صحيح');
  const { balance } = await tx.wallet.update({
    where: { id: walletId },
    data: { balance: { increment: amount } },
    select: { balance: true },
  });
  await tx.walletTransaction.create({
    data: { walletId, amount, type, refId, note, balanceAfter: balance },
  });
  return balance;
}

// خصم مشروط: لا يتم إلا إن كان الرصيد يكفي (والقيد CHECK في القاعدة خط دفاع أخير)
export async function debitWallet(
  tx: Tx,
  walletId: number,
  amount: number,
  refId: string,
  note: string,
): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) throw badRequest('مبلغ غير صحيح');
  const { count } = await tx.wallet.updateMany({
    where: { id: walletId, balance: { gte: amount } },
    data: { balance: { decrement: amount } },
  });
  if (count === 0) throw insufficientBalance();
  const { balance } = await tx.wallet.findUniqueOrThrow({ where: { id: walletId }, select: { balance: true } });
  await tx.walletTransaction.create({
    data: { walletId, amount: -amount, type: 'PURCHASE', refId, note, balanceAfter: balance },
  });
  return balance;
}

export const insufficientBalance = () =>
  new AppError(400, 'رصيد المحفظة غير كافٍ', 'INSUFFICIENT_BALANCE');

// ── الرصيد + آخر المعاملات ───────────────────────────────────────
export async function getWallet(userId: number, take = 30): Promise<WalletDTO> {
  const wallet = await prisma.wallet.upsert({
    where: { userId },
    create: { userId },
    update: {},
    include: { transactions: { orderBy: { createdAt: 'desc' }, take } },
  });
  return { balance: wallet.balance, transactions: wallet.transactions.map(toTxDTO) };
}

// ── شحن بكود: قفل صف الكود ← التحقق ← USED ← زيادة الرصيد ← حركة ← AuditLog (ذرّياً) ─
export async function redeemCode(req: Request, userId: number, code: string): Promise<RedeemResultDTO> {
  const codeHash = hashRedeemCode(code);
  try {
    return await prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ id: number; status: string; value: number }[]>`
        SELECT id, status::text AS status, value FROM "RedeemCode" WHERE "codeHash" = ${codeHash} FOR UPDATE`;
      if (!row) throw badRequest('الكود غير صحيح');
      if (row.status === 'USED') throw conflict('هذا الكود مستخدم من قبل');
      if (row.status !== 'ACTIVE') throw badRequest('هذا الكود معطّل');

      await tx.redeemCode.update({
        where: { id: row.id },
        data: { status: 'USED', usedByUserId: userId, usedAt: new Date() },
      });
      const wallet = await lockWallet(tx, userId);
      const balance = await creditWallet(tx, wallet.id, row.value, 'TOPUP', `code:${row.id}`, 'شحن بكارت');
      await auditTx(tx, req, 'WALLET_REDEEM', 'RedeemCode', { codeId: row.id, amount: row.value, balance });
      return { amount: row.value, balance };
    }, LOCKED_TX);
  } catch (err) {
    // محاولات فاشلة تُسجَّل لرصد التخمين (خارج المعاملة الملغاة) — بلا أي جزء من الكود المُدخل
    if (err instanceof AppError) {
      await audit(req, 'WALLET_REDEEM_FAILED', 'RedeemCode', { reason: err.code, status: err.status });
    }
    throw err;
  }
}

export function toTxDTO(t: {
  id: number;
  amount: number;
  type: WalletTxType;
  balanceAfter: number;
  note: string;
  createdAt: Date;
}): WalletTxDTO {
  return {
    id: t.id,
    amount: t.amount,
    type: t.type,
    balanceAfter: t.balanceAfter,
    note: t.note,
    createdAt: t.createdAt.toISOString(),
  };
}

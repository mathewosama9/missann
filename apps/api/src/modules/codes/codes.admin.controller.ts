import type { Request, Response } from 'express';
import type { AdminCodesFilter, Pagination } from '@miss-ann/shared';
import * as svc from './codes.admin.service.js';

export async function createBatchHandler(req: Request, res: Response): Promise<void> {
  // الأكواد الخام في هذه الاستجابة فقط ← لا تُخزَّن في أي كاش
  res.set('Cache-Control', 'no-store');
  res.status(201).json(await svc.createBatch(req, req.body));
}

export async function listBatchesHandler(req: Request, res: Response): Promise<void> {
  const { page, pageSize } = req.query as unknown as Pagination;
  res.json(await svc.listBatches(page, pageSize));
}

export async function listCodesHandler(req: Request, res: Response): Promise<void> {
  res.json(await svc.listCodes(req.query as unknown as AdminCodesFilter));
}

export async function disableHandler(req: Request, res: Response): Promise<void> {
  await svc.disableCode(req, Number(req.params.id));
  res.json({ message: 'تم تعطيل الكود' });
}

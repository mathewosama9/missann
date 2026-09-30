import type { Request, Response } from 'express';
import type { AdminPaymentsFilter } from '@miss-ann/shared';
import * as svc from './finance.admin.service.js';

export async function listPaymentsHandler(req: Request, res: Response): Promise<void> {
  res.json(await svc.listPayments(req.query as unknown as AdminPaymentsFilter));
}

export async function lookupHandler(req: Request, res: Response): Promise<void> {
  res.json({ student: await svc.lookupStudent(String(req.query.phone)) });
}

export async function topupHandler(req: Request, res: Response): Promise<void> {
  res.json(await svc.manualTopup(req, req.body));
}

export async function enrollHandler(req: Request, res: Response): Promise<void> {
  res.status(201).json(await svc.manualEnroll(req, req.body));
}

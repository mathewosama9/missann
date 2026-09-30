import type { Request, Response } from 'express';
import type { AdminLiveFilter, LiveListFilter } from '@miss-ann/shared';
import * as svc from './live.service.js';

const id = (req: Request) => Number(req.params.id);

// الطالب: لا كاش (joinUrl يظهر/يختفي حسب الوقت)
export async function listHandler(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'private, no-store');
  res.json(await svc.listForStudent(req.user!.sub, req.query as unknown as LiveListFilter));
}

export async function adminListHandler(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'private, no-store');
  res.json(await svc.listAdmin(req.query as unknown as AdminLiveFilter));
}

export async function createHandler(req: Request, res: Response): Promise<void> {
  res.status(201).json({ session: await svc.createSession(req, req.body) });
}

export async function updateHandler(req: Request, res: Response): Promise<void> {
  res.json({ session: await svc.updateSession(req, id(req), req.body) });
}

export async function deleteHandler(req: Request, res: Response): Promise<void> {
  await svc.deleteSession(req, id(req));
  res.json({ message: 'تم حذف الحصة' });
}

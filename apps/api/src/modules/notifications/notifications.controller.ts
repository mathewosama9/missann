import type { Request, Response } from 'express';
import type { NotificationListFilter } from '@miss-ann/shared';
import * as svc from './notifications.service.js';

// الصندوق خاص بالمستخدم ← لا كاش
const noStore = (res: Response) => res.set('Cache-Control', 'no-store');

export async function listHandler(req: Request, res: Response): Promise<void> {
  noStore(res);
  res.json(await svc.listNotifications(req.user!.sub, req.query as unknown as NotificationListFilter));
}

export async function unreadCountHandler(req: Request, res: Response): Promise<void> {
  noStore(res);
  res.json({ count: await svc.unreadCount(req.user!.sub) });
}

export async function readHandler(req: Request, res: Response): Promise<void> {
  res.json(await svc.markRead(req.user!.sub, Number(req.params.id)));
}

export async function readAllHandler(req: Request, res: Response): Promise<void> {
  res.json(await svc.markAllRead(req.user!.sub));
}

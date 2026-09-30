import type { Request, Response } from 'express';
import * as svc from './dashboard.service.js';

// بيانات الطالب الخاصة ← لا كاش
const noStore = (res: Response) => res.set('Cache-Control', 'no-store');

export async function overviewHandler(req: Request, res: Response): Promise<void> {
  noStore(res);
  res.json(await svc.getOverview(req.user!.sub));
}

export async function myCoursesHandler(req: Request, res: Response): Promise<void> {
  noStore(res);
  res.json({ items: await svc.listMyCourses(req.user!.sub) });
}

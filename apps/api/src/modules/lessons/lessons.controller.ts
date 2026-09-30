import type { Request, Response } from 'express';
import * as svc from './lessons.service.js';

export async function playHandler(req: Request, res: Response): Promise<void> {
  const play = await svc.getPlayback(Number(req.params.id), req.user!);
  // رابط موقّع شخصي: لا يُخزَّن في أي كاش وسيط
  res.set('Cache-Control', 'no-store');
  res.json(play);
}

export async function progressHandler(req: Request, res: Response): Promise<void> {
  const result = await svc.saveProgress(Number(req.params.id), req.user!, req.body);
  res.json(result);
}

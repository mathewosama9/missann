import type { Request, Response } from 'express';
import * as svc from './exams.service.js';

// كل ردود الامتحان خاصة بالطالب ← لا كاش
const noStore = (res: Response) => res.set('Cache-Control', 'no-store');

export async function listHandler(req: Request, res: Response): Promise<void> {
  noStore(res);
  res.json({ items: await svc.listExams(req.user!.sub) });
}

export async function detailHandler(req: Request, res: Response): Promise<void> {
  noStore(res);
  res.json({ exam: await svc.getExam(req.user!.sub, Number(req.params.id)) });
}

export async function startHandler(req: Request, res: Response): Promise<void> {
  noStore(res);
  res.json(await svc.startExam(req.user!.sub, Number(req.params.id)));
}

export async function answerHandler(req: Request, res: Response): Promise<void> {
  noStore(res);
  res.json(await svc.saveAnswer(req.user!.sub, Number(req.params.id), req.body));
}

export async function submitHandler(req: Request, res: Response): Promise<void> {
  noStore(res);
  res.json(await svc.submitAttempt(req.user!.sub, Number(req.params.id)));
}

export async function resultHandler(req: Request, res: Response): Promise<void> {
  noStore(res);
  res.json(await svc.getResult(req.user!.sub, Number(req.params.id)));
}

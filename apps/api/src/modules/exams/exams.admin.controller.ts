import type { Request, Response } from 'express';
import type { AdminAttemptsFilter, AdminExamFilter } from '@miss-ann/shared';
import * as svc from './exams.admin.service.js';

const id = (req: Request) => Number(req.params.id);

export async function listHandler(req: Request, res: Response): Promise<void> {
  res.json(await svc.listExams(req.query as unknown as AdminExamFilter));
}

export async function detailHandler(req: Request, res: Response): Promise<void> {
  res.json({ exam: await svc.getExam(id(req)) });
}

export async function createHandler(req: Request, res: Response): Promise<void> {
  res.status(201).json({ exam: await svc.createExam(req, req.body) });
}

export async function updateHandler(req: Request, res: Response): Promise<void> {
  res.json({ exam: await svc.updateExam(req, id(req), req.body) });
}

export async function deleteHandler(req: Request, res: Response): Promise<void> {
  await svc.deleteExam(req, id(req));
  res.json({ message: 'تم حذف الامتحان' });
}

export async function addQuestionHandler(req: Request, res: Response): Promise<void> {
  res.status(201).json({ exam: await svc.addQuestion(req, id(req), req.body) });
}

export async function reorderHandler(req: Request, res: Response): Promise<void> {
  res.json({ exam: await svc.reorderQuestions(req, id(req), req.body.items) });
}

export async function updateQuestionHandler(req: Request, res: Response): Promise<void> {
  res.json({ exam: await svc.updateQuestion(req, id(req), req.body) });
}

export async function deleteQuestionHandler(req: Request, res: Response): Promise<void> {
  res.json({ exam: await svc.deleteQuestion(req, id(req)) });
}

export async function analyticsHandler(req: Request, res: Response): Promise<void> {
  res.json(await svc.examAnalytics(id(req)));
}

export async function attemptsHandler(req: Request, res: Response): Promise<void> {
  res.json(await svc.listAttempts(id(req), req.query as unknown as AdminAttemptsFilter));
}

export async function releaseHandler(req: Request, res: Response): Promise<void> {
  res.json({ exam: await svc.releaseResults(req, id(req), req.body.released) });
}

export async function attemptDetailHandler(req: Request, res: Response): Promise<void> {
  res.json({ attempt: await svc.getAttemptForGrading(id(req)) });
}

export async function gradeHandler(req: Request, res: Response): Promise<void> {
  res.json({ attempt: await svc.gradeAttempt(req, id(req), req.body) });
}

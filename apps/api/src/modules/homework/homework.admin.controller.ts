import type { Request, Response } from 'express';
import type { AdminHomeworkFilter, AdminSubmissionsFilter } from '@miss-ann/shared';
import { badRequest } from '../../lib/http.js';
import * as svc from './homework.admin.service.js';

const id = (req: Request) => Number(req.params.id);

export async function listHandler(req: Request, res: Response): Promise<void> {
  res.json(await svc.listHomework(req.query as unknown as AdminHomeworkFilter));
}

export async function detailHandler(req: Request, res: Response): Promise<void> {
  res.json({ homework: await svc.getHomework(id(req)) });
}

export async function createHandler(req: Request, res: Response): Promise<void> {
  res.status(201).json({ homework: await svc.createHomework(req, req.body) });
}

export async function updateHandler(req: Request, res: Response): Promise<void> {
  res.json({ homework: await svc.updateHomework(req, id(req), req.body) });
}

export async function deleteHandler(req: Request, res: Response): Promise<void> {
  await svc.deleteHomework(req, id(req));
  res.json({ message: 'تم حذف الواجب' });
}

export async function setAttachmentHandler(req: Request, res: Response): Promise<void> {
  if (!req.file) throw badRequest('اختر ملف PDF أو صورة');
  res.json({ homework: await svc.setAttachment(req, id(req), req.file) });
}

export async function removeAttachmentHandler(req: Request, res: Response): Promise<void> {
  res.json({ homework: await svc.removeAttachment(req, id(req)) });
}

export async function submissionsHandler(req: Request, res: Response): Promise<void> {
  res.json(await svc.listSubmissions(id(req), req.query as unknown as AdminSubmissionsFilter));
}

export async function gradeHandler(req: Request, res: Response): Promise<void> {
  const submission = await svc.gradeSubmission(req, id(req), Number(req.params.submissionId), req.body);
  res.json({ submission });
}

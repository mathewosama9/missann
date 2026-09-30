import type { NextFunction, Request, Response } from 'express';
import type { HomeworkListFilter } from '@miss-ann/shared';
import { badRequest } from '../../lib/http.js';
import { sendPrivateFile } from '../../lib/uploads.js';
import * as svc from './homework.service.js';

const id = (req: Request) => Number(req.params.id);

export async function listHandler(req: Request, res: Response): Promise<void> {
  res.json(await svc.listForStudent(req.user!.sub, req.query as unknown as HomeworkListFilter));
}

export async function submissionHandler(req: Request, res: Response): Promise<void> {
  res.json({ submission: await svc.getOwnSubmission(req.user!.sub, id(req)) });
}

// يسبق multer: اشتراك/ملكية/سياسة التسليم قبل استقبال الملف
export async function precheckHandler(req: Request, _res: Response, next: NextFunction): Promise<void> {
  await svc.assertCanSubmit(req.user!.sub, id(req));
  next();
}

export async function submitHandler(req: Request, res: Response): Promise<void> {
  if (!req.file) throw badRequest('اختر ملف الحل للرفع');
  res.status(201).json({ submission: await svc.submit(req.user!.sub, id(req), req.file) });
}

export async function submissionFileHandler(req: Request, res: Response): Promise<void> {
  await sendPrivateFile(res, await svc.submissionFileFor(req.user!, id(req)));
}

export async function attachmentHandler(req: Request, res: Response): Promise<void> {
  await sendPrivateFile(res, await svc.attachmentFileFor(req.user!, id(req)));
}

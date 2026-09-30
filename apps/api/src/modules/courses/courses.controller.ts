import type { Request, Response } from 'express';
import type { CourseFilter } from '@miss-ann/shared';
import * as svc from './courses.service.js';
import { subscribeWithWallet } from './subscription.service.js';

export async function listCoursesHandler(req: Request, res: Response): Promise<void> {
  const result = await svc.listCourses(req.query as unknown as CourseFilter);
  res.json(result);
}

export async function courseDetailHandler(req: Request, res: Response): Promise<void> {
  const course = await svc.getCourseDetail(Number(req.params.id), req.user?.sub);
  res.json({ course });
}

export async function lessonAccessHandler(req: Request, res: Response): Promise<void> {
  const lesson = await svc.getAccessibleLesson(
    Number(req.params.id),
    Number(req.params.lessonId),
    req.user,
  );
  res.json({ lesson });
}

export async function subscribeHandler(req: Request, res: Response): Promise<void> {
  res.status(201).json(await subscribeWithWallet(req, req.user!.sub, Number(req.params.id)));
}

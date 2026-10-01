import type { Request, Response } from 'express';
import type { CourseFilter } from '@miss-ann/shared';
import * as svc from './courses.service.js';
import { subscribeWithWallet } from './subscription.service.js';

// الكتالوج العام متطابق لكل الزوار ← تخزين قصير في المتصفح/CDN (الخادم يخزّنه في Redis أيضاً).
// تفاصيل الكورس لمستخدم مسجّل تحمل حالة اشتراكه ← تبقى خاصة (no-store الافتراضي)
const PUBLIC_CACHE = 'public, max-age=30, stale-while-revalidate=300';

export async function listCoursesHandler(req: Request, res: Response): Promise<void> {
  const result = await svc.listCourses(req.query as unknown as CourseFilter);
  res.set('Cache-Control', PUBLIC_CACHE);
  res.json(result);
}

export async function courseDetailHandler(req: Request, res: Response): Promise<void> {
  const course = await svc.getCourseDetail(Number(req.params.id), req.user?.sub);
  res.vary('Authorization');
  if (!req.user) res.set('Cache-Control', PUBLIC_CACHE);
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

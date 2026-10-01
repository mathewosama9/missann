import type { Request, Response } from 'express';
import type { AdminCourseFilter } from '@miss-ann/shared';
import * as svc from './courses.admin.service.js';
import { bumpCatalog } from './courses.service.js';

// كل كتابة على المحتوى تُبطل كاش الكتالوج العام قبل الرد (الأدمن يرى التغيير فوراً في الموقع)

export async function listHandler(req: Request, res: Response): Promise<void> {
  const result = await svc.listAdminCourses(req.query as unknown as AdminCourseFilter);
  res.json(result);
}

export async function detailHandler(req: Request, res: Response): Promise<void> {
  const course = await svc.getAdminCourse(Number(req.params.id));
  res.json({ course });
}

export async function createHandler(req: Request, res: Response): Promise<void> {
  const course = await svc.createCourse(req, req.body);
  await bumpCatalog();
  res.status(201).json({ course });
}

export async function updateHandler(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const course = await svc.updateCourse(req, id, req.body);
  await bumpCatalog();
  res.json({ course });
}

export async function publishHandler(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  await svc.setPublish(req, id, req.body.isPublished);
  await bumpCatalog();
  res.json({ message: req.body.isPublished ? 'تم نشر الكورس' : 'تم إخفاء الكورس' });
}

export async function deleteHandler(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  await svc.deleteCourse(req, id);
  await bumpCatalog();
  res.json({ message: 'تم حذف الكورس' });
}

export async function addLessonHandler(req: Request, res: Response): Promise<void> {
  const courseId = Number(req.params.id);
  const lesson = await svc.addLesson(req, courseId, req.body);
  await bumpCatalog();
  res.status(201).json({ lesson });
}

export async function updateLessonHandler(req: Request, res: Response): Promise<void> {
  const lessonId = Number(req.params.id);
  await svc.updateLesson(req, lessonId, req.body);
  await bumpCatalog();
  res.json({ message: 'تم تحديث الحصة' });
}

export async function deleteLessonHandler(req: Request, res: Response): Promise<void> {
  const lessonId = Number(req.params.id);
  await svc.deleteLesson(req, lessonId);
  await bumpCatalog();
  res.json({ message: 'تم حذف الحصة' });
}

export async function reorderLessonsHandler(req: Request, res: Response): Promise<void> {
  const courseId = Number(req.params.id);
  await svc.reorderLessons(req, courseId, req.body.items);
  await bumpCatalog();
  res.json({ message: 'تم تحديث ترتيب الحصص' });
}

export async function addAttachmentHandler(req: Request, res: Response): Promise<void> {
  const lessonId = Number(req.params.id);
  const attachment = await svc.addAttachment(req, lessonId, req.body);
  await bumpCatalog();
  res.status(201).json({ attachment });
}

export async function deleteAttachmentHandler(req: Request, res: Response): Promise<void> {
  const attachmentId = Number(req.params.id);
  await svc.deleteAttachment(req, attachmentId);
  await bumpCatalog();
  res.json({ message: 'تم حذف المرفق' });
}

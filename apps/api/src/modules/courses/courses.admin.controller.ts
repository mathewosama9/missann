import type { Request, Response } from 'express';
import type { AdminCourseFilter } from '@miss-ann/shared';
import { audit } from '../../lib/audit.js';
import * as svc from './courses.admin.service.js';

export async function listHandler(req: Request, res: Response): Promise<void> {
  const result = await svc.listAdminCourses(req.query as unknown as AdminCourseFilter);
  res.json(result);
}

export async function detailHandler(req: Request, res: Response): Promise<void> {
  const course = await svc.getAdminCourse(Number(req.params.id));
  res.json({ course });
}

export async function createHandler(req: Request, res: Response): Promise<void> {
  const course = await svc.createCourse(req.body);
  await audit(req, 'COURSE_CREATE', 'Course', { courseId: course.id, title: course.title });
  res.status(201).json({ course });
}

export async function updateHandler(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const course = await svc.updateCourse(id, req.body);
  await audit(req, 'COURSE_UPDATE', 'Course', { courseId: id });
  res.json({ course });
}

export async function publishHandler(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  await svc.setPublish(id, req.body.isPublished);
  await audit(req, 'COURSE_PUBLISH', 'Course', { courseId: id, isPublished: req.body.isPublished });
  res.json({ message: req.body.isPublished ? 'تم نشر الكورس' : 'تم إخفاء الكورس' });
}

export async function deleteHandler(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  await svc.deleteCourse(id);
  await audit(req, 'COURSE_DELETE', 'Course', { courseId: id });
  res.json({ message: 'تم حذف الكورس' });
}

export async function addLessonHandler(req: Request, res: Response): Promise<void> {
  const courseId = Number(req.params.id);
  const lesson = await svc.addLesson(courseId, req.body);
  await audit(req, 'LESSON_CREATE', 'Lesson', { courseId, lessonId: lesson.id });
  res.status(201).json({ lesson });
}

export async function updateLessonHandler(req: Request, res: Response): Promise<void> {
  const lessonId = Number(req.params.id);
  await svc.updateLesson(lessonId, req.body);
  await audit(req, 'LESSON_UPDATE', 'Lesson', { lessonId, fields: Object.keys(req.body) });
  res.json({ message: 'تم تحديث الحصة' });
}

export async function deleteLessonHandler(req: Request, res: Response): Promise<void> {
  const lessonId = Number(req.params.id);
  await svc.deleteLesson(lessonId);
  await audit(req, 'LESSON_DELETE', 'Lesson', { lessonId });
  res.json({ message: 'تم حذف الحصة' });
}

export async function reorderLessonsHandler(req: Request, res: Response): Promise<void> {
  const courseId = Number(req.params.id);
  await svc.reorderLessons(courseId, req.body.items);
  await audit(req, 'LESSON_REORDER', 'Course', { courseId });
  res.json({ message: 'تم تحديث ترتيب الحصص' });
}

export async function addAttachmentHandler(req: Request, res: Response): Promise<void> {
  const lessonId = Number(req.params.id);
  const attachment = await svc.addAttachment(lessonId, req.body);
  await audit(req, 'ATTACHMENT_CREATE', 'Attachment', { lessonId, attachmentId: attachment.id });
  res.status(201).json({ attachment });
}

export async function deleteAttachmentHandler(req: Request, res: Response): Promise<void> {
  const attachmentId = Number(req.params.id);
  await svc.deleteAttachment(attachmentId);
  await audit(req, 'ATTACHMENT_DELETE', 'Attachment', { attachmentId });
  res.json({ message: 'تم حذف المرفق' });
}

import type { Request, Response } from 'express';
import type { AdminStudentsFilter } from '@miss-ann/shared';
import * as svc from './users.admin.service.js';

// بيانات حسابات وكلمات مؤقتة ← لا كاش في المتصفح ولا الوسطاء
const noStore = (res: Response) => res.set('Cache-Control', 'no-store');
const id = (req: Request) => Number(req.params.id);

// ── الطلاب ──────────────────────────────────────────────────────
export async function listStudentsHandler(req: Request, res: Response): Promise<void> {
  noStore(res);
  res.json(await svc.listStudents(req.query as unknown as AdminStudentsFilter));
}

export async function studentDetailHandler(req: Request, res: Response): Promise<void> {
  noStore(res);
  res.json({ student: await svc.getStudent(id(req)) });
}

export async function studentStatusHandler(req: Request, res: Response): Promise<void> {
  res.json(await svc.setUserActive(req, id(req), req.body.isActive, ['STUDENT']));
}

export async function studentResetPasswordHandler(req: Request, res: Response): Promise<void> {
  noStore(res);
  res.json(await svc.resetUserPassword(req, id(req), ['STUDENT']));
}

export async function studentRemoveDeviceHandler(req: Request, res: Response): Promise<void> {
  res.json(await svc.removeStudentDevice(req, id(req), Number(req.params.deviceId)));
}

// ── المساعدون (حسابات الأدمن نفسها لا تُعدَّل من هنا) ──────────────────
export async function listStaffHandler(_req: Request, res: Response): Promise<void> {
  noStore(res);
  res.json({ items: await svc.listStaff() });
}

export async function createStaffHandler(req: Request, res: Response): Promise<void> {
  noStore(res);
  res.status(201).json(await svc.createAssistant(req, req.body));
}

export async function staffStatusHandler(req: Request, res: Response): Promise<void> {
  res.json(await svc.setUserActive(req, id(req), req.body.isActive, ['ASSISTANT']));
}

export async function staffResetPasswordHandler(req: Request, res: Response): Promise<void> {
  noStore(res);
  res.json(await svc.resetUserPassword(req, id(req), ['ASSISTANT']));
}

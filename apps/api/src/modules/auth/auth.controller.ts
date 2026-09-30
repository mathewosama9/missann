import type { Request, Response } from 'express';
import { REFRESH_COOKIE } from '../../lib/cookies.js';
import * as svc from './auth.service.js';

export async function registerHandler(req: Request, res: Response): Promise<void> {
  const result = await svc.register(req.body);
  const message = result.requiresVerification ? 'تم إنشاء الحساب، أدخل كود التفعيل المرسل' : 'تم إنشاء الحساب، سجّل الدخول';
  res.status(201).json({ message, ...result });
}

export async function verifyOtpHandler(req: Request, res: Response): Promise<void> {
  await svc.verifyActivation(req.body.phone, req.body.code);
  res.json({ message: 'تم تفعيل الحساب بنجاح' });
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const result = await svc.login(req.body, req, res);
  res.json(result);
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const result = await svc.refresh(req.cookies?.[REFRESH_COOKIE], res);
  res.json(result);
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  await svc.logout(req.cookies?.[REFRESH_COOKIE], res);
  res.json({ message: 'تم تسجيل الخروج' });
}

export async function forgotPasswordHandler(req: Request, res: Response): Promise<void> {
  await svc.forgotPassword(req.body.phone);
  res.json({ message: 'إذا كان الرقم مسجّلاً فسيصلك كود الاستعادة' });
}

export async function resetPasswordHandler(req: Request, res: Response): Promise<void> {
  await svc.resetPassword(req.body);
  res.json({ message: 'تم تغيير كلمة المرور، سجّل الدخول' });
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  const user = await svc.me(req.user!.sub);
  res.json({ user });
}

export async function listDevicesHandler(req: Request, res: Response): Promise<void> {
  res.json({ devices: await svc.listDevices(req.user!.sub) });
}

export async function removeDeviceHandler(req: Request, res: Response): Promise<void> {
  await svc.removeDevice(req.user!.sub, Number(req.params.id), req.cookies?.[REFRESH_COOKIE]);
  res.json({ message: 'تم إزالة الجهاز' });
}

export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  await svc.changePassword(req.user!.sub, req.body.currentPassword, req.body.newPassword, req.cookies?.[REFRESH_COOKIE]);
  res.json({ message: 'تم تغيير كلمة المرور' });
}

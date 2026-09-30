import type { Request, Response } from 'express';
import * as svc from './payments.service.js';

export async function initHandler(req: Request, res: Response): Promise<void> {
  res.status(201).json(await svc.initPaymob(req, req.user!.sub, req.body));
}

// Paymob يرسل الإشعار JSON والتوقيع في ?hmac= (أي رد غير 2xx يجعله يعيد الإرسال)
export async function webhookHandler(req: Request, res: Response): Promise<void> {
  const outcome = await svc.handlePaymobWebhook(req, req.body, req.query.hmac);
  res.json({ received: true, outcome });
}

export async function paymentHandler(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  res.json({ payment: await svc.getOwnPayment(req.user!.sub, Number(req.params.id)) });
}

import type { Request, Response } from 'express';
import * as svc from './wallet.service.js';

export async function walletHandler(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  res.json(await svc.getWallet(req.user!.sub));
}

export async function redeemHandler(req: Request, res: Response): Promise<void> {
  res.json(await svc.redeemCode(req, req.user!.sub, req.body.code));
}

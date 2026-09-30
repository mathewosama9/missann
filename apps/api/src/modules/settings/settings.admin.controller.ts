import type { Request, Response } from 'express';
import type { AuditLogFilter } from '@miss-ann/shared';
import * as svc from './settings.admin.service.js';

export async function getSettingsHandler(_req: Request, res: Response): Promise<void> {
  res.json({ settings: await svc.getSettings() });
}

export async function updateSettingsHandler(req: Request, res: Response): Promise<void> {
  res.json({ settings: await svc.updateSettings(req, req.body) });
}

export async function listAuditLogsHandler(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  res.json(await svc.listAuditLogs(req.query as unknown as AuditLogFilter));
}

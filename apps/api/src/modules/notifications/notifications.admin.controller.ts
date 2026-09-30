import type { Request, Response } from 'express';
import type { AdminMessagesFilter, BroadcastListFilter, TemplateChannel } from '@miss-ann/shared';
import * as svc from './notifications.admin.service.js';

const tpl = (req: Request) => ({ key: req.params.key!, channel: req.params.channel as TemplateChannel });

// 202: البث محفوظ والتوزيع يتم في الخلفية
export async function broadcastHandler(req: Request, res: Response): Promise<void> {
  res.status(202).json({ broadcast: await svc.createBroadcast(req, req.body) });
}

export async function listBroadcastsHandler(req: Request, res: Response): Promise<void> {
  res.json(await svc.listBroadcasts(req.query as unknown as BroadcastListFilter));
}

export async function listMessagesHandler(req: Request, res: Response): Promise<void> {
  res.json(await svc.listMessages(req.query as unknown as AdminMessagesFilter));
}

export async function listTemplatesHandler(_req: Request, res: Response): Promise<void> {
  res.json({ items: await svc.listTemplates() });
}

export async function createTemplateHandler(req: Request, res: Response): Promise<void> {
  res.status(201).json({ template: await svc.createTemplate(req, req.body) });
}

export async function saveTemplateHandler(req: Request, res: Response): Promise<void> {
  const { key, channel } = tpl(req);
  res.json({ template: await svc.saveTemplate(req, key, channel, req.body) });
}

export async function deleteTemplateHandler(req: Request, res: Response): Promise<void> {
  const { key, channel } = tpl(req);
  res.json(await svc.deleteTemplate(req, key, channel));
}

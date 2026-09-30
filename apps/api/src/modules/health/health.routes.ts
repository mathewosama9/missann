import { Router } from 'express';
import { checkDb } from '../../lib/prisma.js';
import { checkRedis } from '../../lib/redis.js';
import { asyncHandler } from '../../lib/http.js';

export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [db, redisOk] = await Promise.all([checkDb(), checkRedis()]);
    res.json({ status: db ? 'ok' : 'degraded', db, redis: redisOk, ts: Date.now() });
  }),
);

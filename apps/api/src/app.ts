import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes.js';
import { uploadsStatic } from './lib/uploads.js';

export function createApp() {
  const app = express();
  // عدد الوسطاء أمام الـ API (nginx داخل الحاوية = 1؛ + Caddy/موازن أمامه = 2) ← req.ip الحقيقي لحدود الطلبات
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(helmet());
  app.use(
    cors({
      origin: env.APP_URL,
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));
  app.use('/api', globalLimiter);
  // الافتراضي: ردود الـ API خاصة ولا تُخزَّن (متصفح/وسيط)؛ الكتالوج العام وحده يعلن تخزيناً قصيراً
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.use('/api/uploads', uploadsStatic);
  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

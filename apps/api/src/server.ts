import { createApp } from './app.js';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { ensureRedis } from './lib/redis.js';
import { closeQueues } from './lib/queue.js';
import { startWorkers, stopWorkers } from './jobs/workers.js';

async function main() {
  await ensureRedis().catch(() => logger.warn('Redis غير متصل عند الإقلاع'));
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 API يعمل على http://localhost:${env.PORT}`);
  });

  if (env.JOBS_ENABLED === 'true') {
    // فشل الطوابير لا يوقف الـ API (الإغلاق الكسول + الكنّاس عند العودة يغطيان)
    startWorkers().catch((err) => logger.error({ err }, 'تعذّر تشغيل عمّال الطوابير'));
  }

  const shutdown = async () => {
    server.close();
    await stopWorkers();
    await closeQueues();
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'فشل إقلاع الخادم');
  process.exit(1);
});

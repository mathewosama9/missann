import { Worker, type Job } from 'bullmq';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { createQueueConnection, getQueue, JOBS, QUEUES } from '../lib/queue.js';
import { finalizeAttempt, flushParentOutbox, sweepOverdueAttempts } from '../modules/exams/exams.service.js';
import { expireStalePayments } from '../modules/payments/payments.service.js';
import { broadcastJob, expiryWarningsJob, liveReminderJob, parentExamResultJob } from '../modules/notifications/producers.js';
import { deliverMessageJob, type DeliverJobData } from '../modules/notifications/delivery.js';
import { flushNotificationOutbox } from '../modules/notifications/outbox.js';

// ── عمّال BullMQ داخل عملية الـ API ─────────────────────────────

async function closeAttemptJob(job: Job<{ attemptId: number }>) {
  return finalizeAttempt(job.data.attemptId, 'timeout');
}

// طابور الإشعارات يحمل أكثر من نوع ← التوزيع حسب اسم الـ job
async function notificationsJob(job: Job) {
  if (job.name === JOBS.parentExamResult) return parentExamResultJob(job as Job<{ attemptId: number }>);
  if (job.name === JOBS.liveReminder) return liveReminderJob(job as Job<{ sessionId: number; startAt: string }>);
  if (job.name === JOBS.broadcast) return broadcastJob(job as Job<{ broadcastId: number }>);
  logger.warn({ job: job.name, id: job.id }, 'job إشعارات غير معروف');
  return null;
}

async function maintenanceJob(job: Job) {
  if (job.name === JOBS.sweepAttempts) {
    const closed = await sweepOverdueAttempts();
    const queued = await flushParentOutbox();
    if (closed || queued) logger.info({ closed, queued }, 'كنّاس الامتحانات');
    return { closed, queued };
  }
  if (job.name === JOBS.expirePayments) {
    const expired = await expireStalePayments();
    if (expired) logger.info({ expired }, 'دفعات PENDING قديمة ← FAILED');
    return { expired };
  }
  if (job.name === JOBS.sweepNotifications) {
    const r = await flushNotificationOutbox();
    if (r.messages || r.broadcasts || r.expiredOtp || r.orphaned) logger.info(r, 'كنّاس الإشعارات');
    return r;
  }
  if (job.name === JOBS.expiryWarnings) return expiryWarningsJob();
  return null;
}

const workers: Worker[] = [];

export async function startWorkers(): Promise<void> {
  const make = (name: string, fn: (job: Job) => Promise<unknown>, opts: { concurrency: number; limiter?: { max: number; duration: number } }) => {
    const w = new Worker(name, fn, { connection: createQueueConnection(), ...opts });
    w.on('failed', (job, err) => logger.warn({ queue: name, job: job?.name, id: job?.id, err: err.message }, 'فشل job'));
    w.on('error', (err) => logger.warn({ queue: name, err: err.message }, 'خطأ عامل الطابور'));
    workers.push(w);
  };
  make(QUEUES.notifications, notificationsJob, { concurrency: 3 });
  // التسليم للمزوّد: سقف عالمي للرسائل/ثانية (limiter مشترك بين كل العمّال عبر Redis)
  make(QUEUES.messages, (job) => deliverMessageJob(job as Job<DeliverJobData>), {
    concurrency: 5,
    limiter: { max: env.MESSAGES_PER_SEC, duration: 1000 },
  });
  make(QUEUES.exams, (job) => closeAttemptJob(job as Job<{ attemptId: number }>), { concurrency: 5 });
  make(QUEUES.maintenance, maintenanceJob, { concurrency: 1 });

  // جداول دورية (upsert ← لا تكرار عند إعادة التشغيل)
  const maintenance = getQueue('maintenance');
  await maintenance.upsertJobScheduler(JOBS.sweepAttempts, { every: 60_000 }, { name: JOBS.sweepAttempts });
  await maintenance.upsertJobScheduler(JOBS.expirePayments, { every: 10 * 60_000 }, { name: JOBS.expirePayments });
  await maintenance.upsertJobScheduler(JOBS.sweepNotifications, { every: 60_000 }, { name: JOBS.sweepNotifications });
  // يومياً 9 صباحاً بتوقيت القاهرة
  await maintenance.upsertJobScheduler(JOBS.expiryWarnings, { pattern: '0 9 * * *', tz: 'Africa/Cairo' }, { name: JOBS.expiryWarnings });
  logger.info('عمّال الطوابير تعمل (notifications, messages, exams, maintenance)');
}

export async function stopWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close().catch(() => undefined)));
  workers.length = 0;
}

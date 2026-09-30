import { Queue, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

// ── طوابير BullMQ ───────────────────────────────────────────────
// notifications: منتجو الإشعارات (ولي الأمر، تذكير اللايف، الإرسال الجماعي) — ينشئون الصفوف ويوزّعون
// messages: تسليم رسالة صادرة واحدة لمزوّد واتساب/SMS (بمعدل محدود يحترم حدود المزوّد)
// exams: إغلاق محاولة عند موعدها (job مؤجّل لكل محاولة)
// maintenance: كنّاسات دورية (محاولات معلّقة، دفعات PENDING قديمة، outbox الإشعارات والرسائل)
export const QUEUES = {
  notifications: 'notifications',
  messages: 'messages',
  exams: 'exams',
  maintenance: 'maintenance',
} as const;
export type QueueKey = keyof typeof QUEUES;

export const JOBS = {
  parentExamResult: 'parent-exam-result',
  closeAttempt: 'close-attempt',
  sweepAttempts: 'sweep-attempts',
  expirePayments: 'expire-payments',
  liveReminder: 'live-reminder',
  broadcast: 'broadcast',
  deliverMessage: 'deliver-message',
  sweepNotifications: 'sweep-notifications',
  expiryWarnings: 'expiry-warnings',
} as const;

// اتصال مستقل لكل طابور/عامل (BullMQ يتطلب maxRetriesPerRequest=null ويستخدم أوامر حاجبة)
export const createQueueConnection = () => new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const DEFAULTS: Record<QueueKey, JobsOptions> = {
  notifications: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
  // المحاولة الأخيرة تُعلِّم الرسالة FAILED مع آخر خطأ (30s ← 1m ← 2m ← 4m)
  messages: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
  exams: { attempts: 3, backoff: { type: 'exponential', delay: 5_000 }, removeOnComplete: true, removeOnFail: 1000 },
  maintenance: { attempts: 1, removeOnComplete: 50, removeOnFail: 200 },
};

const queues = new Map<QueueKey, Queue>();
export function getQueue(key: QueueKey): Queue {
  let q = queues.get(key);
  if (!q) {
    q = new Queue(QUEUES[key], { connection: createQueueConnection(), defaultJobOptions: DEFAULTS[key] });
    q.on('error', (err) => logger.warn({ err: err.message, queue: key }, 'خطأ اتصال الطابور'));
    queues.set(key, q);
  }
  return q;
}

const ENQUEUE_TIMEOUT_MS = 3_000;

// عملية Redis بمهلة قصيرة: الطلب لا يعلق لو Redis متوقف، والفشل يُسجَّل ولا يُرمى
// (المستدعي لديه outbox/كنّاس يعيد المحاولة)
async function withTimeout(op: () => Promise<unknown>, failMsg: string, log: Record<string, unknown>): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      op(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('redis timeout')), ENQUEUE_TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch (err) {
    logger.warn({ err: (err as Error).message, ...log }, failMsg);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// دفع job بدون أن يعلق الطلب. jobId ثابت ← الإضافة المكرّرة لا تنشئ job ثانياً
// (وقد يصل الـ job متأخراً رغم المهلة: jobId + تعليم الإرسال داخل العامل يمنعان التكرار)
export function enqueue(
  key: QueueKey,
  name: string,
  data: Record<string, unknown>,
  opts: JobsOptions & { jobId: string },
): Promise<boolean> {
  return withTimeout(() => getQueue(key).add(name, data, opts), 'تعذّر دفع job للطابور', { queue: key, job: name, jobId: opts.jobId });
}

export interface BulkJob {
  name: string;
  data: Record<string, unknown>;
  opts: JobsOptions & { jobId: string };
}

// دفعة jobs في رحلة Redis واحدة (توزيع الإرسال الجماعي) بنفس ضمانات enqueue
export function enqueueBulk(key: QueueKey, jobs: BulkJob[]): Promise<boolean> {
  if (jobs.length === 0) return Promise.resolve(true);
  return withTimeout(() => getQueue(key).addBulk(jobs), 'تعذّر دفع دفعة jobs للطابور', { queue: key, jobs: jobs.length });
}

// إزالة job مؤجّل (إعادة جدولة/حذف) بنفس الضمانات.
// job نشط (قيد التنفيذ) لا يُزال — العامل يتحقق من صلاحية بياناته بنفسه.
export function removeJob(key: QueueKey, jobId: string): Promise<boolean> {
  return withTimeout(
    async () => {
      const job = await getQueue(key).getJob(jobId);
      if (job) await job.remove();
    },
    'تعذّر إزالة job من الطابور',
    { queue: key, jobId },
  );
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close().catch(() => undefined)));
  queues.clear();
}

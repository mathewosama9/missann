// الدفع للطابور لا يعلق الطلب حتى لو Redis متوقف: يرجع false خلال المهلة بدل الانتظار للأبد
import { describe, it, expect, afterAll } from 'vitest';

process.env.REDIS_URL = 'redis://127.0.0.1:6399'; // منفذ بلا خادم
const { enqueue, closeQueues } = await import('../src/lib/queue.js');

afterAll(async () => {
  await closeQueues();
});

describe('enqueue', () => {
  it('Redis غير متاح ← false خلال ~3 ثوانٍ (لا يحجب الطلب)', async () => {
    const t0 = Date.now();
    const ok = await enqueue('notifications', 'parent-exam-result', { attemptId: 1 }, { jobId: 'test-offline-1' });
    expect(ok).toBe(false);
    expect(Date.now() - t0).toBeLessThan(4_500);
  }, 10_000);
});

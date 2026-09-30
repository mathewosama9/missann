import IORedis from 'ioredis';
import { env } from './env.js';

// اتصال Redis مشترك (للطوابير والكاش)
export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

let connected = false;
export async function ensureRedis(): Promise<void> {
  if (!connected) {
    await redis.connect().catch(() => undefined);
    connected = true;
  }
}

export async function checkRedis(): Promise<boolean> {
  try {
    await ensureRedis();
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

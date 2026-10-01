import { ensureRedis, redis } from './redis.js';
import { logger } from './logger.js';

// ── كاش قراءة قصير في Redis ──────────────────────────────────────
// الكاش تحسين فقط: Redis بطيء أو متوقف ← نحسب مباشرة ولا يعلق الطلب (مهلة قصيرة لكل عملية)
const CACHE_TIMEOUT_MS = 300;

async function within<V>(op: () => Promise<V>): Promise<V | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      op(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), CACHE_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    logger.debug({ err: (err as Error).message }, 'تعذّر الوصول لكاش Redis');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function cached<T>(key: string, ttlSec: number, compute: () => Promise<T>): Promise<T> {
  const hit = await within(async () => {
    await ensureRedis();
    return redis.get(key);
  });
  if (hit) {
    try {
      return JSON.parse(hit) as T;
    } catch {
      // قيمة تالفة ← تُحسب من جديد وتُستبدل
    }
  }
  const value = await compute();
  void within(() => redis.set(key, JSON.stringify(value), 'EX', ttlSec));
  return value;
}

export function invalidateCache(key: string): Promise<unknown> {
  return within(() => redis.del(key));
}

// ── مفاتيح بإصدار لمجموعة بيانات (مثل الكتالوج): الكتابة ترفع الإصدار فتُهمل كل مفاتيح المجموعة
// دفعة واحدة (القديمة تنتهي بمهلتها) — بلا بحث/حذف مفاتيح. Redis متوقف ← "0" والحساب مباشرة
export async function cacheGeneration(ns: string): Promise<string> {
  const v = await within(async () => {
    await ensureRedis();
    return redis.get(`${ns}:gen`);
  });
  return v ?? '0';
}

export function bumpCacheGeneration(ns: string): Promise<unknown> {
  return within(() => redis.incr(`${ns}:gen`));
}

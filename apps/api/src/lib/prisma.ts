import { PrismaClient } from '@prisma/client';
import { isProd } from './env.js';

export const prisma = new PrismaClient({
  log: isProd ? ['error'] : ['warn', 'error'],
});

// خيارات المعاملات التفاعلية ذات الأقفال (FOR UPDATE): الافتراضي (2s انتظار اتصال / 5s مدة)
// قصير تحت التزاحم على نفس الصف؛ تجاوزها يُرجع 503 "حاول مرة أخرى" من errorHandler
export const LOCKED_TX = { maxWait: 10_000, timeout: 15_000 } as const;

export async function checkDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

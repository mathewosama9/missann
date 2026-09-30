import { prisma } from '../../lib/prisma.js';

// ── إعدادات المنصة (صف واحد id=1، يُنشأ في الـ migration) ────────────
// الصف غير موجود (قاعدة لم تُهاجَر) ← الافتراضي الآمن: التحقق بالكود مفعّل
export async function getPlatformSettings(): Promise<{ requirePhoneVerification: boolean }> {
  const s = await prisma.platformSettings.findUnique({ where: { id: 1 }, select: { requirePhoneVerification: true } });
  return { requirePhoneVerification: s?.requirePhoneVerification ?? true };
}

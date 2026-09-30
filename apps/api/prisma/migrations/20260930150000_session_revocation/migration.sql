-- إنهاء الجلسات فوراً (توكن الوصول الأقدم مرفوض) + كشف إعادة استخدام توكن تحديث مُدوَّر
-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "rotated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionsRevokedAt" TIMESTAMP(3);

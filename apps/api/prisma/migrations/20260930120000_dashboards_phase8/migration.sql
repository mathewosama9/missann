-- Phase 8: لوحات التحكم — فهارس الإحصائيات/البحث/سجل العمليات + إعدادات المنصة

-- بحث الأدمن بجزء من الاسم/الموبايل (GIN trigram). ملاحظة: مع ctype = C (قاعدة التطوير المحلية)
-- الحروف العربية لا تُنتج trigrams فبحث الأسماء العربية لا يستفيد من الفهرس؛ على قاعدة بـ UTF-8 locale يستفيد.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- DropIndex (استُبدلت بفهارس مركّبة تغطي نفس البادئة)
DROP INDEX "AuditLog_actorId_idx";

-- DropIndex
DROP INDEX "AuditLog_entity_idx";

-- DropIndex
DROP INDEX "LessonProgress_userId_idx";

-- DropIndex
DROP INDEX "User_role_idx";

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "requirePhoneVerification" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_actorId_id_idx" ON "AuditLog"("actorId", "id");

-- CreateIndex
CREATE INDEX "AuditLog_entity_id_idx" ON "AuditLog"("entity", "id");

-- CreateIndex
CREATE INDEX "AuditLog_action_id_idx" ON "AuditLog"("action", "id");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Enrollment_createdAt_idx" ON "Enrollment"("createdAt");

-- CreateIndex
CREATE INDEX "LessonProgress_userId_updatedAt_idx" ON "LessonProgress"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Payment_status_paidAt_idx" ON "Payment"("status", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "RedeemCode_usedAt_idx" ON "RedeemCode"("usedAt");

-- CreateIndex
CREATE INDEX "User_role_createdAt_idx" ON "User"("role", "createdAt");

-- CreateIndex
CREATE INDEX "User_name_trgm_idx" ON "User" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "User_phone_trgm_idx" ON "User" USING GIN ("phone" gin_trgm_ops);

-- ── قيود يدوية (Prisma لا يعبّر عنها) ─────────────────────────────
-- إعدادات المنصة صف واحد فقط، ويُنشأ بالقيم الافتراضية (التحقق مفعّل)
ALTER TABLE "PlatformSettings" ADD CONSTRAINT "PlatformSettings_singleton" CHECK ("id" = 1);
INSERT INTO "PlatformSettings" ("id", "requirePhoneVerification", "updatedAt") VALUES (1, true, now() at time zone 'utc');

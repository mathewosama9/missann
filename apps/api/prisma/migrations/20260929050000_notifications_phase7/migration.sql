-- CreateEnum
CREATE TYPE "NotifType" AS ENUM ('GENERAL', 'OTP', 'PARENT_EXAM_RESULT', 'LIVE_REMINDER', 'ENROLLMENT_EXPIRY');

-- CreateEnum
CREATE TYPE "BroadcastAudience" AS ENUM ('ALL', 'GRADE', 'COURSE');

-- DropIndex
DROP INDEX "Notification_userId_isRead_idx";

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "broadcastId" INTEGER,
ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "providerMessageId" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "toPhone" TEXT,
DROP COLUMN "type",
ADD COLUMN     "type" "NotifType" NOT NULL DEFAULT 'GENERAL';

-- CreateTable
CREATE TABLE "NotificationBroadcast" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "BroadcastAudience" NOT NULL,
    "grade" "Grade",
    "courseId" INTEGER,
    "alsoWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "channel" "NotifChannel" NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationBroadcast_completedAt_idx" ON "NotificationBroadcast"("completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_key_channel_key" ON "NotificationTemplate"("key", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_channel_id_idx" ON "Notification"("userId", "channel", "id");

-- CreateIndex
CREATE INDEX "Notification_userId_channel_isRead_id_idx" ON "Notification"("userId", "channel", "isRead", "id");

-- CreateIndex
CREATE INDEX "Notification_broadcastId_idx" ON "Notification"("broadcastId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "NotificationBroadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationBroadcast" ADD CONSTRAINT "NotificationBroadcast_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ── قيود سلامة البيانات + فهرس الـ outbox (Phase 7) ─────────────
-- إشعار داخلي: بلا رقم ومُسلَّم دائماً؛ رسالة صادرة: لها رقم مصري
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_inapp_shape" CHECK ("channel" <> 'IN_APP' OR ("toPhone" IS NULL AND "status" = 'SENT'));
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_outbound_phone" CHECK ("channel" = 'IN_APP' OR "toPhone" ~ '^01[0125][0-9]{8}$');
-- SENT ⇔ sentAt (للرسائل الصادرة)، والمحاولات غير سالبة
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_sent_pair" CHECK ("channel" = 'IN_APP' OR (("status" = 'SENT') = ("sentAt" IS NOT NULL)));
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_attempts_nonneg" CHECK ("attempts" >= 0);
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_lengths" CHECK (char_length("title") <= 160 AND char_length("body") BETWEEN 1 AND 2000 AND char_length(coalesce("lastError", '')) <= 500);
-- الكنّاس (PENDING الصادرة) وسجل الرسائل للأدمن (حسب الحالة، الأحدث أولاً) — الصفوف الداخلية لا تدخل الفهرس
CREATE INDEX "Notification_outbox_idx" ON "Notification"("status", "id") WHERE "channel" <> 'IN_APP';

-- الجمهور: GRADE يحتاج صفاً، ALL بلا صف ولا كورس (COURSE قد يصبح courseId فارغاً بعد حذف الكورس)
ALTER TABLE "NotificationBroadcast" ADD CONSTRAINT "NotificationBroadcast_audience_shape" CHECK (
  ("audience" = 'ALL' AND "grade" IS NULL AND "courseId" IS NULL)
  OR ("audience" = 'GRADE' AND "grade" IS NOT NULL AND "courseId" IS NULL)
  OR ("audience" = 'COURSE' AND "grade" IS NULL)
);
ALTER TABLE "NotificationBroadcast" ADD CONSTRAINT "NotificationBroadcast_recipients_nonneg" CHECK ("recipients" >= 0);

-- القوالب: قناة داخلية أو واتساب (SMS بديل لنص واتساب)، مفتاح slug، أطوال محدودة
ALTER TABLE "NotificationTemplate" ADD CONSTRAINT "NotificationTemplate_channel" CHECK ("channel" IN ('IN_APP', 'WHATSAPP'));
ALTER TABLE "NotificationTemplate" ADD CONSTRAINT "NotificationTemplate_key_slug" CHECK ("key" ~ '^[a-z][a-z0-9_]{2,39}$');
ALTER TABLE "NotificationTemplate" ADD CONSTRAINT "NotificationTemplate_lengths" CHECK (char_length("title") <= 160 AND char_length("body") BETWEEN 1 AND 1000);

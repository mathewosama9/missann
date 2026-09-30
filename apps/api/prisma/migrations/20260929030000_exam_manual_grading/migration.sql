-- أسئلة كتابية بتصحيح يدوي + إعداد توقيت ظهور النتيجة

-- CreateEnum
CREATE TYPE "ResultRelease" AS ENUM ('IMMEDIATE', 'AFTER_END', 'MANUAL');

-- AlterEnum (PostgreSQL 12+: مسموح داخل المعاملة طالما القيم الجديدة لا تُستخدم فيها)
ALTER TYPE "QuestionType" ADD VALUE 'ESSAY';
ALTER TYPE "QuestionType" ADD VALUE 'COMPLETE';
ALTER TYPE "QuestionType" ADD VALUE 'TERM';

-- AlterTable
ALTER TABLE "Answer" ADD COLUMN     "awardedPoints" INTEGER,
ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "gradedAt" TIMESTAMP(3),
ADD COLUMN     "text" TEXT,
ALTER COLUMN "choiceId" DROP NOT NULL;

-- AlterTable: showResult ← resultRelease مع الحفاظ على سلوك الامتحانات الحالية
ALTER TABLE "Exam" ADD COLUMN     "resultRelease" "ResultRelease" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "resultsReleasedAt" TIMESTAMP(3);
UPDATE "Exam" SET "resultRelease" = CASE
  WHEN NOT "showResult" THEN 'MANUAL'::"ResultRelease"
  WHEN "endAt" IS NOT NULL THEN 'AFTER_END'::"ResultRelease"
  ELSE 'IMMEDIATE'::"ResultRelease"
END;
ALTER TABLE "Exam" DROP COLUMN "showResult";

-- AlterTable
ALTER TABLE "ExamAttempt" ADD COLUMN     "gradedAt" TIMESTAMP(3),
ADD COLUMN     "parentNotifiedAt" TIMESTAMP(3);
-- المحاولات المنتهية الحالية كلها موضوعية ← مصحّحة
UPDATE "ExamAttempt" SET "gradedAt" = "submittedAt" WHERE "status" <> 'IN_PROGRESS';
-- ما دُفع للطابور قبل الآن يُعتبر مُرسَلاً (لا إعادة إرسال)
UPDATE "ExamAttempt" SET "parentNotifiedAt" = "parentNotifyQueuedAt" WHERE "parentNotifyQueuedAt" IS NOT NULL;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "modelAnswer" TEXT;

-- قيود سلامة البيانات
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_choice_xor_text" CHECK (("choiceId" IS NULL) <> ("text" IS NULL));
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_awarded_non_negative" CHECK ("awardedPoints" IS NULL OR "awardedPoints" >= 0);
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_after_end_needs_endAt" CHECK ("resultRelease" <> 'AFTER_END' OR "endAt" IS NOT NULL);

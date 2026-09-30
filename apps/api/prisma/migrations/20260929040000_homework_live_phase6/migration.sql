-- DropIndex
DROP INDEX "Homework_courseId_idx";

-- DropIndex
DROP INDEX "LiveSession_courseId_idx";

-- AlterTable
ALTER TABLE "Homework" DROP COLUMN "attachmentUrl",
ADD COLUMN     "attachmentKey" TEXT,
ADD COLUMN     "attachmentMime" TEXT,
ADD COLUMN     "attachmentName" TEXT,
ADD COLUMN     "maxGrade" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "HomeworkSubmission" DROP COLUMN "fileUrl",
ADD COLUMN     "fileKey" TEXT NOT NULL,
ADD COLUMN     "fileMime" TEXT NOT NULL,
ADD COLUMN     "fileName" TEXT NOT NULL,
ADD COLUMN     "fileSize" INTEGER NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "LiveSession" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "Homework_courseId_dueAt_idx" ON "Homework"("courseId", "dueAt");

-- CreateIndex
CREATE INDEX "Homework_lessonId_idx" ON "Homework"("lessonId");

-- CreateIndex
CREATE INDEX "HomeworkSubmission_homeworkId_submittedAt_idx" ON "HomeworkSubmission"("homeworkId", "submittedAt");

-- CreateIndex
CREATE INDEX "LiveSession_courseId_startAt_idx" ON "LiveSession"("courseId", "startAt");


-- ── قيود سلامة البيانات (Phase 6) ─────────────────────────────
-- الدرجة النهائية للواجب 1..100، ودرجة التسليم غير سالبة (الحد الأعلى maxGrade يُفرض في الخدمة داخل معاملة)
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_maxGrade_range" CHECK ("maxGrade" BETWEEN 1 AND 100);
ALTER TABLE "HomeworkSubmission" ADD CONSTRAINT "HomeworkSubmission_grade_nonneg" CHECK ("grade" IS NULL OR "grade" >= 0);
ALTER TABLE "HomeworkSubmission" ADD CONSTRAINT "HomeworkSubmission_fileSize_pos" CHECK ("fileSize" > 0);
-- الدرجة والتصحيح متلازمان: لا درجة بلا gradedAt ولا العكس
ALTER TABLE "HomeworkSubmission" ADD CONSTRAINT "HomeworkSubmission_graded_pair" CHECK (("grade" IS NULL) = ("gradedAt" IS NULL));
-- مدة الحصة اللايف 10..600 دقيقة، والرابط https فقط (قائمة المضيفين المسموحة تُفرض في Zod)
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_duration_range" CHECK ("durationMin" BETWEEN 10 AND 600);
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_joinUrl_https" CHECK ("joinUrl" LIKE 'https://%');

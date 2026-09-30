-- DropIndex
DROP INDEX "Exam_grade_idx";

-- AlterTable
ALTER TABLE "Answer" ADD COLUMN     "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Choice" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "description" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ExamAttempt" ADD COLUMN     "deadlineAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "parentNotifyQueuedAt" TIMESTAMP(3),
ADD COLUMN     "questionOrder" INTEGER[];

-- CreateIndex
CREATE INDEX "Answer_questionId_idx" ON "Answer"("questionId");

-- CreateIndex
CREATE INDEX "Exam_grade_isPublished_idx" ON "Exam"("grade", "isPublished");

-- CreateIndex
CREATE INDEX "ExamAttempt_status_deadlineAt_idx" ON "ExamAttempt"("status", "deadlineAt");


-- قيود سلامة البيانات فوق تحقق Zod
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_duration_positive" CHECK ("durationMin" > 0);
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_passScore_percent" CHECK ("passScore" BETWEEN 0 AND 100);
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_window_order" CHECK ("startAt" IS NULL OR "endAt" IS NULL OR "endAt" > "startAt");
ALTER TABLE "Question" ADD CONSTRAINT "Question_points_positive" CHECK ("points" > 0);
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_score_range" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= "totalPoints"));

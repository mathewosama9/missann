-- CreateEnum
CREATE TYPE "VideoProvider" AS ENUM ('BUNNY', 'YOUTUBE');

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "videoProvider" "VideoProvider" NOT NULL DEFAULT 'BUNNY',
ADD COLUMN     "youtubeVideoId" TEXT;

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "deadlineAt" TIMESTAMP(3),
ADD COLUMN     "deadlineNote" TEXT,
ADD COLUMN     "deadlineSource" TEXT;

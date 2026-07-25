-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('ASSESSMENT_DUE', 'OFFER_DECISION', 'INTERVIEW_TOMORROW', 'NO_REPLY', 'POSTING_CLOSES');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "digestEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "quietHoursEnd" TEXT NOT NULL DEFAULT '08:00',
ADD COLUMN     "quietHoursStart" TEXT NOT NULL DEFAULT '22:00',
ADD COLUMN     "reminderSettings" JSONB;

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT,
    "kind" "ReminderKind" NOT NULL,
    "offsetMinutes" INTEGER NOT NULL,
    "viaEmail" BOOLEAN NOT NULL DEFAULT true,
    "viaPush" BOOLEAN NOT NULL DEFAULT false,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reminder_userId_idx" ON "Reminder"("userId");

-- CreateIndex
CREATE INDEX "Reminder_applicationId_idx" ON "Reminder"("applicationId");

-- CreateIndex
CREATE INDEX "Reminder_sentAt_scheduledFor_idx" ON "Reminder"("sentAt", "scheduledFor");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

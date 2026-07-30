-- AlterTable
ALTER TABLE "RateLimitEvent" ADD COLUMN     "ipHash" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "RateLimitEvent_ipHash_feature_createdAt_idx" ON "RateLimitEvent"("ipHash", "feature", "createdAt");

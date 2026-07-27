-- AlterTable
ALTER TABLE "User" ADD COLUMN     "density" TEXT NOT NULL DEFAULT 'compact',
ADD COLUMN     "palette" TEXT NOT NULL DEFAULT 'ledger',
ADD COLUMN     "scanFrequency" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "theme" TEXT NOT NULL DEFAULT 'system';

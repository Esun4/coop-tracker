-- AlterTable
ALTER TABLE "User" ADD COLUMN     "recentEmailIds" TEXT[] DEFAULT ARRAY[]::TEXT[];


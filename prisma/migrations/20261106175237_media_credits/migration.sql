-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "credit" TEXT,
ADD COLUMN     "creditUrl" TEXT,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "license" TEXT;

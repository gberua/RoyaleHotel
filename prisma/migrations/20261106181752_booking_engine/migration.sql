-- AlterEnum
ALTER TYPE "BookingSource" ADD VALUE 'WHATSAPP';

-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "guestCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "holdExpiresAt" TIMESTAMP(3),
ADD COLUMN     "paymentPlan" TEXT,
ADD COLUMN     "priceBreakdown" JSONB,
ADD COLUMN     "refundAmount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "IcalFeed" ADD COLUMN     "lastCount" INTEGER,
ADD COLUMN     "name" TEXT;

-- AlterTable
ALTER TABLE "RoomAllocation" ADD COLUMN     "childAges" INTEGER[],
ADD COLUMN     "extraGuestTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "roomTypeId" TEXT;

-- AlterTable
ALTER TABLE "RoomType" ADD COLUMN     "baseOccupancy" INTEGER NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "BookingSequence" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BookingSequence_pkey" PRIMARY KEY ("year")
);

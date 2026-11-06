-- AlterTable
ALTER TABLE "Extra" DROP COLUMN "isPlaceholder";

-- AlterTable
ALTER TABLE "Media" DROP COLUMN "isPlaceholder";

-- AlterTable
ALTER TABLE "OccupancyRule" DROP COLUMN "isPlaceholder";

-- AlterTable
ALTER TABLE "Offer" DROP COLUMN "isPlaceholder";

-- AlterTable
ALTER TABLE "Policy" DROP COLUMN "isPlaceholder",
ADD COLUMN     "draft" JSONB;

-- AlterTable
ALTER TABLE "Room" DROP COLUMN "isPlaceholder";

-- AlterTable
ALTER TABLE "RoomType" DROP COLUMN "isPlaceholder";

-- AlterTable
ALTER TABLE "Service" DROP COLUMN "isPlaceholder";


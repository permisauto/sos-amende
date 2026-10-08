-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "refusMotif" TEXT,
ADD COLUMN     "refuseLe" TIMESTAMP(3),
ADD COLUMN     "valideLe" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telephone" TEXT;

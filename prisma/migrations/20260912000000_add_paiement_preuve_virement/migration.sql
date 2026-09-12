-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "preuveNom" TEXT,
ADD COLUMN     "preuveUploadedAt" TIMESTAMP(3),
ADD COLUMN     "preuveUrl" TEXT;

-- AlterEnum
ALTER TYPE "DossierStatut" ADD VALUE 'AVOCAT_REQUIS';

-- AlterTable
ALTER TABLE "Dossier" ADD COLUMN     "classeContravention" INTEGER,
ADD COLUMN     "consignationMontant" DECIMAL(10,2),
ADD COLUMN     "consignationPayeeLe" TIMESTAMP(3),
ADD COLUMN     "voieProcedure" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "rembourseLe" TIMESTAMP(3);

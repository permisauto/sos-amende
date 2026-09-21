-- AlterEnum
ALTER TYPE "DossierEventType" ADD VALUE 'VERIFICATION_POUSSEE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DossierStatut" ADD VALUE 'EN_ATTENTE_PAIEMENT';
ALTER TYPE "DossierStatut" ADD VALUE 'EN_ATTENTE_VALIDATION';
ALTER TYPE "DossierStatut" ADD VALUE 'EN_ATTENTE_PRE_SIGNATURE';

-- AlterTable
ALTER TABLE "Dossier" ADD COLUMN     "canalEnvoi" TEXT,
ADD COLUMN     "remarquesJuriste" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "dossierId" TEXT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

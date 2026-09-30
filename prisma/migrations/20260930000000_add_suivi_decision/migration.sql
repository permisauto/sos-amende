-- AlterTable
ALTER TABLE "Dossier" ADD COLUMN     "decisionAttendueLe" TIMESTAMP(3),
ADD COLUMN     "decisionRecupereeLe" TIMESTAMP(3),
ADD COLUMN     "numeroDepot" TEXT,
ADD COLUMN     "reponsePortail" TEXT;

-- CreateIndex
CREATE INDEX "Dossier_numeroDepot_idx" ON "Dossier"("numeroDepot");
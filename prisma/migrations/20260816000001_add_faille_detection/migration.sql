-- CreateEnum
CREATE TYPE "DossierFailleStatut" AS ENUM ('CANDIDATE', 'CONFIRMEE', 'REJETEE');

-- AlterTable
ALTER TABLE "Dossier" ADD COLUMN     "pvTexte" TEXT;

-- AlterTable
ALTER TABLE "FailleJuridique" ADD COLUMN     "reglesDetection" JSONB;

-- CreateTable
CREATE TABLE "DossierFaille" (
    "id" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "failleId" TEXT NOT NULL,
    "statut" "DossierFailleStatut" NOT NULL DEFAULT 'CANDIDATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DossierFaille_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DossierFaille_dossierId_failleId_key" ON "DossierFaille"("dossierId", "failleId");

-- AddForeignKey
ALTER TABLE "DossierFaille" ADD CONSTRAINT "DossierFaille_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DossierFaille" ADD CONSTRAINT "DossierFaille_failleId_fkey" FOREIGN KEY ("failleId") REFERENCES "FailleJuridique"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
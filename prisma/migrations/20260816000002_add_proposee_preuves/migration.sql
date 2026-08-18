-- AlterEnum
ALTER TYPE "FailleStatut" ADD VALUE 'PROPOSEE';

-- AlterTable
ALTER TABLE "FailleJuridique" ADD COLUMN     "jurisprudence" JSONB;

-- CreateTable
CREATE TABLE "Preuve" (
    "id" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "userId" TEXT,
    "url" TEXT NOT NULL,
    "nom" TEXT NOT NULL DEFAULT 'piece',
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Preuve_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Preuve_dossierId_idx" ON "Preuve"("dossierId");

-- AddForeignKey
ALTER TABLE "Preuve" ADD CONSTRAINT "Preuve_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
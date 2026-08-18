-- CreateEnum
CREATE TYPE "LawyerMatchStatut" AS ENUM ('DEMANDE', 'AFFECTE', 'REFUSE');

-- CreateTable
CREATE TABLE "LawyerMatch" (
    "id" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "statut" "LawyerMatchStatut" NOT NULL DEFAULT 'DEMANDE',
    "motif" TEXT,
    "partnerName" TEXT,
    "partnerBarreau" TEXT,
    "partnerEmail" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LawyerMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LawyerMatch_dossierId_key" ON "LawyerMatch"("dossierId");

-- AddForeignKey
ALTER TABLE "LawyerMatch" ADD CONSTRAINT "LawyerMatch_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawyerMatch" ADD CONSTRAINT "LawyerMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
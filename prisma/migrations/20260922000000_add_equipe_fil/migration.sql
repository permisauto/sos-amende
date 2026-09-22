-- AlterTable
ALTER TABLE "MessageInterne" DROP CONSTRAINT "MessageInterne_destinataireId_fkey";

-- DropIndex
DROP INDEX "MessageInterne_destinataireId_lu_idx";

-- DropIndex
DROP INDEX "MessageInterne_expediteurId_createdAt_idx";

-- AlterTable
DELETE FROM "MessageInterne";
ALTER TABLE "MessageInterne" DROP COLUMN "destinataireId",
ADD COLUMN     "dossierId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "MessageInterne_dossierId_lu_idx" ON "MessageInterne"("dossierId", "lu");

-- CreateIndex
CREATE INDEX "MessageInterne_dossierId_createdAt_idx" ON "MessageInterne"("dossierId", "createdAt");

-- AddForeignKey
ALTER TABLE "MessageInterne" ADD CONSTRAINT "MessageInterne_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
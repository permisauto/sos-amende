-- CreateEnum
CREATE TYPE "SourceJuridiqueStatut" AS ENUM ('NOUVEAU', 'PROMU', 'ECARTE');

-- CreateTable
CREATE TABLE "SourceJuridique" (
    "id" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "idDila" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "nature" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "juridiction" TEXT,
    "dateSource" DATE,
    "reference" TEXT,
    "ecli" TEXT,
    "url" TEXT,
    "contenu" TEXT NOT NULL,
    "citations" JSONB,
    "matchsCore" JSONB,
    "matchsAppui" JSONB,
    "score" INTEGER NOT NULL DEFAULT 0,
    "brouillonRegle" TEXT,
    "statut" "SourceJuridiqueStatut" NOT NULL DEFAULT 'NOUVEAU',
    "failleId" TEXT,
    "archive" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "SourceJuridique_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceJuridique_cle_key" ON "SourceJuridique"("cle");

-- CreateIndex
CREATE INDEX "SourceJuridique_statut_score_idx" ON "SourceJuridique"("statut", "score");

-- CreateIndex
CREATE INDEX "SourceJuridique_source_dateSource_idx" ON "SourceJuridique"("source", "dateSource");

-- CreateIndex
CREATE INDEX "SourceJuridique_createdAt_idx" ON "SourceJuridique"("createdAt");

-- AddForeignKey
ALTER TABLE "SourceJuridique" ADD CONSTRAINT "SourceJuridique_failleId_fkey" FOREIGN KEY ("failleId") REFERENCES "FailleJuridique"("id") ON DELETE SET NULL ON UPDATE CASCADE;

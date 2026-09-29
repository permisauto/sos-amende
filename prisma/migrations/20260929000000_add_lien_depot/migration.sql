-- CreateTable
CREATE TABLE "LienDepot" (
    "id" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "consommeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LienDepot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LienDepot_dossierId_key" ON "LienDepot"("dossierId");

-- CreateIndex
CREATE UNIQUE INDEX "LienDepot_tokenHash_key" ON "LienDepot"("tokenHash");

-- CreateIndex
CREATE INDEX "LienDepot_expireLe_idx" ON "LienDepot"("expireLe");

-- AddForeignKey
ALTER TABLE "LienDepot" ADD CONSTRAINT "LienDepot_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

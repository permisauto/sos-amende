-- CreateTable
CREATE TABLE "AutoAlimentationTrace" (
    "id" TEXT NOT NULL,
    "campagne" TEXT NOT NULL,
    "statut" TEXT NOT NULL,
    "traitees" INTEGER NOT NULL DEFAULT 0,
    "nouvelles" INTEGER NOT NULL DEFAULT 0,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoAlimentationTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoAlimentationTrace_campagne_createdAt_idx" ON "AutoAlimentationTrace"("campagne", "createdAt");

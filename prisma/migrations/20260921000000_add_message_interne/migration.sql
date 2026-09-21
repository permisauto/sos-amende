-- CreateTable
CREATE TABLE "MessageInterne" (
    "id" TEXT NOT NULL,
    "expediteurId" TEXT NOT NULL,
    "destinataireId" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageInterne_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageInterne_destinataireId_lu_idx" ON "MessageInterne"("destinataireId", "lu");

-- CreateIndex
CREATE INDEX "MessageInterne_expediteurId_createdAt_idx" ON "MessageInterne"("expediteurId", "createdAt");

-- AddForeignKey
ALTER TABLE "MessageInterne" ADD CONSTRAINT "MessageInterne_expediteurId_fkey" FOREIGN KEY ("expediteurId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageInterne" ADD CONSTRAINT "MessageInterne_destinataireId_fkey" FOREIGN KEY ("destinataireId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

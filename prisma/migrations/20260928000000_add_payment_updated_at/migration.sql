-- AlterTable
-- Le modèle Payment déclare updatedAt @updatedAt (chaque create/update l'écrit),
-- mais la migration 20260815000000_init n'a jamais créé cette colonne — tout
-- INSERT/UPDATE Payment échouait en prod (fallback mock). Ajout rattrapage.
ALTER TABLE "Payment" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
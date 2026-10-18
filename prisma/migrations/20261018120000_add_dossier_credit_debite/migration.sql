-- AlterTable
-- Marquage financier : `true` dès qu'un crédit a réellement été débité pour ce
-- dossier. Source de vérité du remboursement au rejet (`rejeterDossier`) — on ne
-- rend que ce qui a été débité (corrige une fuite de crédits : un dossier sans
-- faille partait en validation sans débit puis était remboursé au rejet).
-- Défaut `false` : les dossiers existants ne sont plus remboursés à tort.
ALTER TABLE "Dossier" ADD COLUMN     "creditDebite" BOOLEAN NOT NULL DEFAULT false;

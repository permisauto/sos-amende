-- AlterTable Dossier : preuves meteo/travaux
ALTER TABLE "Dossier" ADD COLUMN "conditions_meteo" TEXT;
ALTER TABLE "Dossier" ADD COLUMN "travaux_présents" BOOLEAN;
-- AlterTable RadarCalibration : champs complementaires
ALTER TABLE "RadarCalibration" ADD COLUMN "date_dernier_renouvellement" TIMESTAMP(3);
ALTER TABLE "RadarCalibration" ADD COLUMN "etat_certificat" TEXT;
CREATE UNIQUE INDEX "RadarCalibration_radarId_key" ON "RadarCalibration"("radarId");
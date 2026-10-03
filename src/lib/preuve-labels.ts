// Libellés des types de pièces — source UNIQUE (formulaire d'analyse,
// fiche dossier, tableau de bord, bloc juriste, e-mails de relance).
// Module pur, sans « use client » : importable côté serveur et côté client.

export const TYPE_LABELS: Record<string, string> = {
  CARTE_GRISE: "Carte grise",
  PLAINTE: "Récépissé de plainte",
  PHOTO: "Photo du véhicule",
  CERTIFICAT: "Certificat",
  RELEVE_PAIEMENT: "Relevé de paiement",
  ATTESTATION_CESSION: "Attestation de cession",
  ATTESTATION_VOL: "Attestation de vol",
  AUTRE: "Autre pièce",
  METEO: "Météo (source externe)",
  RADAR: "Fiche radar (donnée officielle)",
  TRAVAUX: "Travaux (source OpenData)",
};

/** Libellé affichable d'un type de pièce (inconnu → la clé telle quelle). */
export function libellePreuve(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

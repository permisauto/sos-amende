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
  COPIE_DECISION: "Copie de la décision notifiée",
  RELEVE_POINTS: "Relevé de points (permis)",
  ATTESTATION_STAGE: "Attestation de stage de sensibilisation",
  KBIS: "Extrait Kbis de l'entreprise",
  // Lot R2 — pièces d'urgence par situation (radio « Votre urgence »).
  CONTRAT_TRAVAIL: "Contrat de travail",
  ATTESTATION_EMPLOYEUR: "Attestation de l'employeur (télétravail impossible)",
  BILAN_COMMANDES: "Bilan comptable ou carnet de commandes",
  JUSTIFICATIF_DOMICILE: "Justificatif de domicile de moins de 3 mois",
  HORAIRES_TRANSPORTS: "Horaires des transports de la commune",
  CERTIFICAT_MEDICAL_PROCHE: "Certificat médical du proche",
  ATTESTATION_HONNEUR: "Attestation sur l'honneur (aucun autre conducteur)",
  // Lot R3 — pièces des questions amende (cliché radar, marquage stationnement).
  CLICHE_ANTAI: "Cliché de contrôle (photo du flash)",
  PHOTO_MARQUAGE: "Photo du marquage au sol",
  AUTRE: "Autre pièce",
  METEO: "Météo (source externe)",
  RADAR: "Fiche radar (donnée officielle)",
  TRAVAUX: "Travaux (source OpenData)",
};

/** Libellé affichable d'un type de pièce (inconnu → la clé telle quelle). */
export function libellePreuve(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

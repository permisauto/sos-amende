// Libellés et badges partagés des interfaces admin (suivi des dossiers +
// paiements) — source unique pour garantir l'unité visuelle des tableaux.
export const statusLabels: Record<string, string> = {
  BROUILLON: "Brouillon",
  EN_ANALYSE: "En analyse",
  EN_ATTENTE_PAIEMENT: "En attente de paiement",
  EN_ATTENTE_VALIDATION: "À valider par le juriste",
  EN_ATTENTE_PRE_SIGNATURE: "En attente de signature client",
  A_VERIFIER: "À vérifier",
  PRET: "Prêt",
  ENVOYE: "Envoyé",
  REJETE: "Rejeté",
  ERREUR_TECHNIQUE: "Erreur technique",
  RESOLU: "Résolu",
  ANNULE: "Annulé",
};

export const statutBadge: Record<string, string> = {
  EN_ATTENTE_VALIDATION: "bg-amber-100 text-amber-800",
  EN_ATTENTE_PRE_SIGNATURE: "bg-indigo-100 text-indigo-800",
  EN_ATTENTE_PAIEMENT: "bg-zinc-100 text-zinc-600",
  PRET: "bg-amber-100 text-amber-800",
  A_VERIFIER: "bg-indigo-100 text-indigo-800",
  ENVOYE: "bg-emerald-100 text-emerald-800",
  REJETE: "bg-red-100 text-red-800",
  RESOLU: "bg-emerald-100 text-emerald-800",
  ERREUR_TECHNIQUE: "bg-red-100 text-red-700",
  ANNULE: "bg-zinc-100 text-zinc-500",
  EN_ANALYSE: "bg-zinc-100 text-zinc-600",
  BROUILLON: "bg-zinc-100 text-zinc-600",
};

export const BADGES_PAIEMENT: Record<
  string,
  { label: string; classe: string }
> = {
  PENDING_VIREMENT: {
    label: "En attente",
    classe: "bg-amber-100 text-amber-800",
  },
  PAID: { label: "Validé", classe: "bg-emerald-100 text-emerald-800" },
  REFUSED: { label: "Refusé", classe: "bg-red-100 text-red-800" },
};

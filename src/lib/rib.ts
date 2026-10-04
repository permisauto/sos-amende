const IBAN = process.env.NEXT_PUBLIC_RIB_IBAN;
const BIC = process.env.NEXT_PUBLIC_RIB_BIC;
const TITULAIRE = process.env.NEXT_PUBLIC_RIB_TITULAIRE;

/**
 * RIB de paiement centralisé. Sans variable `NEXT_PUBLIC_RIB_*` configurée on
 * n'expose AUCUNE coordonnée bancaire réelle : les valeurs affichées sont
 * explicitement non payantes et `placeholder` signale à l'UI d'afficher
 * l'avertissement (audit lot 3 — plus de RIB codé en dur dans le dépôt).
 */
export const RIB = {
  iban: IBAN ?? "IBAN NON RENSEIGNÉ",
  bic: BIC ?? "BIC NON RENSEIGNÉ",
  titulaire: TITULAIRE ?? "NON RENSEIGNÉ",
  placeholder: !IBAN || !BIC || !TITULAIRE,
} as const;

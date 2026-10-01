const IBAN = process.env.NEXT_PUBLIC_RIB_IBAN;
const BIC = process.env.NEXT_PUBLIC_RIB_BIC;
const TITULAIRE = process.env.NEXT_PUBLIC_RIB_TITULAIRE;

/**
 * RIB de paiement centralisé. Sans variable `NEXT_PUBLIC_RIB_*` configurée on
 * retombe sur des valeurs de démonstration : l'UI doit alors afficher un
 * avertissement explicite (pas de virement réel possible sur un RIB fictif).
 */
export const RIB = {
  iban: IBAN ?? "BE06 9058 9752 3122",
  bic: BIC ?? "TRWIBEB1XXX",
  titulaire: TITULAIRE ?? "DIXIT LLC",
  placeholder: !IBAN || !BIC || !TITULAIRE,
} as const;

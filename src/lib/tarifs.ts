/**
 * Tarifs V1 — source unique des prix (plus de 39/59/349 éparpillés dans le
 * code). Deux offres étanches :
 * - **Amende — 39 €** : contestation d'amende simple et gel des points,
 *   lettre validée par un juriste, dépôt assisté (lien ANTAI par e-mail).
 * - **Suspension & Invalidation — 199 €** (offre unique) : pack combiné
 *   « requête au fond + référé-suspension (art. L. 521-2 CJA) + bordereau »
 *   pour un dépôt sur Télérecours Citoyens (arrêtés 3F et invalidation 48SI).
 *
 * Option « lettre recommandée » (LRAR) : +10 € (montants avec option :
 * 49 € / 209 €).
 */

export const PRIX_AMENDE = 39;
export const PRIX_SUSPENSION = 199;
export const PRIX_OPTION_LRAR = 10;

export type TypeInfraction = "AMENDE" | "SUSPENSION";

export function prixBase(type: TypeInfraction): number {
  return type === "SUSPENSION" ? PRIX_SUSPENSION : PRIX_AMENDE;
}

export function montantAvecOption(
  type: TypeInfraction,
  optionLrar: boolean,
): number {
  return prixBase(type) + (optionLrar ? PRIX_OPTION_LRAR : 0);
}

/** Libellé compact « 39 € » / « 49 € » en fonction de l'option. */
export function libelleMontant(
  type: TypeInfraction,
  optionLrar = false,
): string {
  return `${montantAvecOption(type, optionLrar)} €`;
}

/** Libellé « 39,00 € » / « 49,00 € » (affichage RIB). */
export function libelleMontantCentimes(
  type: TypeInfraction,
  optionLrar = false,
): string {
  return `${montantAvecOption(type, optionLrar).toFixed(2).replace(".", ",")} €`;
}

/**
 * Un paiement porte-t-il l'offre « Suspension & Invalidation » (pack REP +
 * référé inclus) ? Le montant débité est la source de vérité (aucune colonne
 * `Payment.offre`) : pour une suspension, seul le tarif de l'offre unique
 * atteint 199 €.
 */
export function estOffreSuspension(kind: string, amount: number): boolean {
  return kind === "SUSPENSION" && amount >= PRIX_SUSPENSION;
}

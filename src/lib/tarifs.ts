/**
 * Tarifs V1 — source unique des prix (plus de 39/59 éparpillés dans le code).
 * Base : 39 € / amende, 59 € / suspension. Option « lettre recommandée » (LRAR)
 * en supplément de 10 € (montants avec option : 49 € / 69 €).
 */

export const PRIX_AMENDE = 39;
export const PRIX_SUSPENSION = 59;
export const PRIX_OPTION_LRAR = 10;

export type TypeInfraction = "AMENDE" | "SUSPENSION";

export function prixBase(type: TypeInfraction): number {
  return type === "SUSPENSION" ? PRIX_SUSPENSION : PRIX_AMENDE;
}

export function montantAvecOption(type: TypeInfraction, optionLrar: boolean): number {
  return prixBase(type) + (optionLrar ? PRIX_OPTION_LRAR : 0);
}

/** Libellé compact « 39 € » / « 49 € » en fonction de l'option. */
export function libelleMontant(type: TypeInfraction, optionLrar = false): string {
  return `${montantAvecOption(type, optionLrar)} €`;
}

/** Libellé « 39,00 € » / « 49,00 € » (affichage RIB). */
export function libelleMontantCentimes(type: TypeInfraction, optionLrar = false): string {
  return `${montantAvecOption(type, optionLrar).toFixed(2).replace(".", ",")} €`;
}
/**
 * Tarifs V1 — source unique des prix (plus de 39/59/349 éparpillés dans le
 * code). Trois offres :
 * - **Amende simple — 39 €** : contraventions des classes 1 à 3, lettre
 *   validée par un juriste, dépôt assisté (lien ANTAI par e-mail).
 * - **Contentieux contraventionnel — 149 €** : contraventions des classes 4 et
 *   5 (consignation obligatoire avant le dépôt), même service de lettre et de
 *   dépôt assisté, avec suivi de la consignation.
 * - **Suspension & Invalidation — 199 €** (offre unique) : pack combiné
 *   « requête au fond + référé-suspension (art. L. 521-2 CJA) + bordereau »
 *   pour un dépôt sur Télérecours Citoyens (arrêtés 3F et invalidation 48SI).
 *
 * Option « lettre recommandée » (LRAR) : +10 € (montants avec option :
 * 49 € / 159 € / 209 €).
 *
 * Les délits ne sont pas vendus (avocat obligatoire) — aucun débit.
 */

import { estContentieux } from "./procedure";

export const PRIX_AMENDE = 39;
export const PRIX_CONTENTIEUX = 149;
export const PRIX_SUSPENSION = 199;
export const PRIX_OPTION_LRAR = 10;

export type TypeInfraction = "AMENDE" | "SUSPENSION";
export type OffrePaiement = TypeInfraction | "CONTENTIEUX";

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

/** Prix de base d'un dossier d'amende selon sa voie de procédure. */
export function prixBaseAmende(
  voie: string | null | undefined,
  optionLrar = false,
): number {
  const base = estContentieux(voie) ? PRIX_CONTENTIEUX : PRIX_AMENDE;
  return base + (optionLrar ? PRIX_OPTION_LRAR : 0);
}

/**
 * Prix de base d'un dossier, toutes offres confondues. `voie` n'a de sens que
 * pour une amende ; une suspension garde son tarif unique (199 €).
 */
export function prixDossier(
  type: TypeInfraction,
  voie: string | null | undefined,
  optionLrar = false,
): number {
  return type === "SUSPENSION"
    ? montantAvecOption("SUSPENSION", optionLrar)
    : prixBaseAmende(voie, optionLrar);
}

/** Libellé compact du prix d'un dossier (« 39 € », « 149 € », « 199 € »). */
export function libelleMontantDossier(
  type: TypeInfraction,
  voie: string | null | undefined,
  optionLrar = false,
): string {
  return `${prixDossier(type, voie, optionLrar)} €`;
}

/** Libellé RIB (« 149,00 € »). */
export function libelleMontantCentimesDossier(
  type: TypeInfraction,
  voie: string | null | undefined,
  optionLrar = false,
): string {
  return `${prixDossier(type, voie, optionLrar).toFixed(2).replace(".", ",")} €`;
}

/** Nature du `Payment` à créer pour un dossier d'amende. */
export function kindPaiementAmende(
  voie: string | null | undefined,
): "AMENDE" | "CONTENTIEUX" {
  return estContentieux(voie) ? "CONTENTIEUX" : "AMENDE";
}

/** Ce paiement correspond-il à l'offre contentieux (149 €) ? */
export function estOffreContentieux(kind: string, amount: number): boolean {
  return kind === "CONTENTIEUX" && amount >= PRIX_CONTENTIEUX;
}


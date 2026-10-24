import { PRIX_CONTENTIEUX } from "@/lib/tarifs";

/**
 * Le contentieux contraventionnel (4e/5e classe) est une offre à part :
 * l'examen du dossier par le juriste est gratuit, mais **rien ne peut être
 * validé ni envoyé** tant que le paiement de 149 € rattaché au dossier n'a pas
 * été encaissé. Sans ce verrou, un juriste pouvait confirmer une faille puis
 * valider la lettre d'un dossier "sans faille" jamais payé.
 */
export function contentieuxNonRegle(
  dossier: { type: string; voieProcedure?: string | null },
  paiementPaye: { id: string } | null | undefined,
): boolean {
  return (
    dossier.type === "AMENDE" &&
    dossier.voieProcedure === "CONTENTIEUX_CONTRAVENTION" &&
    !paiementPaye
  );
}

export const MESSAGE_CONTENTIEUX_NON_REGLE = `Le paiement contentieux (${PRIX_CONTENTIEUX} €) doit être encaissé avant de valider la lettre ou de l'envoyer. Le client peut régler depuis son dossier.`;

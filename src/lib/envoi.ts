/**
 * Libellés d'envoi dépendant du type d'infraction (AMENDE vs SUSPENSION).
 * Module pur (testable). Le contenu reste procédural — aucun fondement
 * juridique n'est inventé ici : les motifs et articles viennent uniquement
 * des `FailleJuridique.templateLettre` validés par l'admin.
 */

export type InfractionType = "AMENDE" | "SUSPENSION";

export function destinataireLrar(type: InfractionType): string {
  return type === "SUSPENSION"
    ? "à l'adresse du préfet indiquée sur votre décision"
    : "à l'adresse de l'OMP indiquée sur votre avis de contravention";
}

export function pieceAJoindre(type: InfractionType): string {
  return type === "SUSPENSION"
    ? "une copie de la décision de rétention ou d'invalidation"
    : "une copie de votre avis de contravention";
}

export function delaiLibelle(type: InfractionType): string {
  return type === "SUSPENSION"
    ? "délai de recours (2 mois)"
    : "délai de contestation (45 jours)";
}

export function titreAnalyse(type: InfractionType): string {
  return type === "SUSPENSION"
    ? "de votre décision de rétention ou d'invalidation"
    : "de votre avis de contravention";
}

export function numeroRefLibelle(type: InfractionType): string {
  return type === "SUSPENSION" ? "Numéro de décision" : "Numéro de PV";
}

export function dateRefLibelle(type: InfractionType): string {
  return type === "SUSPENSION" ? "Date de la décision" : "Date du PV";
}

/**
 * Portail officiel de dépôt en ligne de la contestation.
 * - AMENDE : téléservice ANTAI « Désigner ou contester en ligne »
 * - SUSPENSION : Télérecours citoyens (tribunal administratif)
 * URLs officielles vérifiées (antai.gouv.fr / telerecours.fr).
 */
export function portailEnLigne(type: InfractionType): {
  label: string;
  url: string;
} {
  return type === "SUSPENSION"
    ? {
        label: "Télérecours citoyens (tribunal administratif)",
        url: "https://citoyens.telerecours.fr/#/authentication",
      }
    : {
        label: "ANTAI — Désigner ou contester en ligne",
        url: "https://www.usagers.antai.gouv.fr/demarches/saisienumero?lang=fr",
      };
}
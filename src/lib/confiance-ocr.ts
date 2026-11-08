import type { ExtractedData } from "./moteur";
import { normaliserPv } from "./ocr";

/**
 * Confiance OCR par champ — provenance d'un champ extrait, dérivée **sans
 * toucher au contrat d'IA** : le code produit déjà les champs de deux sources
 * distinctes (le provider structuré `extrait`, et les regex locales
 * `normaliserPv`). Un champ que ni l'une ni l'autre n'a produit est `absent` —
 * ce qui peut signifier « réellement absent » **ou** « mal lu par l'OCR ».
 *
 * Ce module n'éclaire que le juriste : il ne modifie jamais le moteur ni les
 * règles, et ne bloque rien.
 */

/** Provenance possible d'un champ extrait. */
export type ProvenanceChamp = "structure" | "regex" | "absent";

/**
 * Champs d'`ExtractedData` qui alimentent les règles de détection du moteur
 * (`moteur.ts`, `evalRegle`). Seuls ces champs sont surveillés : une provenance
 * `absent` sur l'un d'eux mérite un signal au juriste.
 */
export const CHAMPS_DETECTION = [
  "num_pv",
  "plaque",
  "date",
  "heure",
  "numTelePaiement",
  "cle",
  "typeRadar",
  "radarId",
  "dateVerificationAppareil",
  "adresse",
  "lieu",
  "montant",
  "neph",
  "libelleInfraction",
  "dateEmission",
  "soldePoints",
  "pointsEncourus",
  "pointsRetiresMemesDate",
  "dateSignatureArrete",
  "heureSignatureArrete",
  "dateStage",
  "dateNotification",
  "mesure",
] as const;

export type ChampDetection = (typeof CHAMPS_DETECTION)[number];

export type ProvenanceParChamp = Partial<Record<ChampDetection, ProvenanceChamp>>;

/** true si la valeur est « présente » (non nulle / non vide après trim). */
function present(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return true; // nombre, objet (mesure), booléen : considéré présent
}

/**
 * Provenance de chaque champ surveillé :
 *  - `structure` si le provider structuré (`extrait`) l'a fourni ;
 *  - sinon `regex` si `normaliserPv(texte)` l'a extrait ;
 *  - sinon `absent`.
 */
export function provenanceChamps(
  extrait: Partial<ExtractedData> | undefined,
  texte: string | null | undefined,
): ProvenanceParChamp {
  const regex = texte ? normaliserPv(texte) : {};
  const out: ProvenanceParChamp = {};
  for (const champ of CHAMPS_DETECTION) {
    if (extrait && present((extrait as Record<string, unknown>)[champ])) {
      out[champ] = "structure";
    } else if (present((regex as Record<string, unknown>)[champ])) {
      out[champ] = "regex";
    } else {
      out[champ] = "absent";
    }
  }
  return out;
}

/** Champs surveillés dont la lecture est incertaine (provenance `absent`). */
export function champsIncertains(
  provenance: ProvenanceParChamp,
): ChampDetection[] {
  return CHAMPS_DETECTION.filter((champ) => provenance[champ] === "absent");
}

/** Libellé français d'un champ surveillé, pour l'encart juriste. */
export function libelleChamp(champ: ChampDetection): string {
  const labels: Record<ChampDetection, string> = {
    num_pv: "numéro de l'avis",
    plaque: "plaque d'immatriculation",
    date: "date de l'infraction",
    heure: "heure de l'infraction",
    numTelePaiement: "n° de télépaiement",
    cle: "clé de télépaiement",
    typeRadar: "type de l'appareil",
    radarId: "n° d'identification du radar",
    dateVerificationAppareil: "date de vérification du cinémomètre",
    adresse: "adresse",
    lieu: "lieu",
    montant: "montant",
    neph: "NEPH",
    libelleInfraction: "nature de l'infraction",
    dateEmission: "date d'émission",
    soldePoints: "solde de points",
    pointsEncourus: "points encourus",
    pointsRetiresMemesDate: "retraits de points le même jour",
    dateSignatureArrete: "date de signature de l'arrêté",
    heureSignatureArrete: "heure de signature de l'arrêté",
    dateStage: "date du stage",
    dateNotification: "date de notification",
    mesure: "mesure technique (alcool/vitesse)",
  };
  return labels[champ];
}
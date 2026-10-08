/**
 * 4ᵉ source de veille : les **tribunaux administratifs** (TA), publiés par la
 * DILA sur `opendata.justice-administrative.fr` en archives ZIP **mensuelles**
 * (`/DTA/AAAAMM/TA_AAAAMM.zip`, ~64 Mo, ~19 000 XML) — auto-alimentation §H.
 *
 * Arbitrage validé : ingestion **1×/mois, le 8 du mois M+1** sur le zip du
 * mois M (le zip est réécrit jusqu'à ~une semaine après fin de mois — le 8,
 * il est stable). Le point de reprise est le nom de la dernière archive
 * réellement ingérée, stocké dans le détail des traces (`derniere=TA_AAAAMM.zip`),
 * exactement comme pour les tar.gz quotidiens de la DILA.
 *
 * Format réel observé (zip `TA_202609.zip`, 18 943 fichiers) : des
 * `<Document>` par décision, un par répertoire départemental (`TA06/…`),
 * avec les balises `Donnees_Techniques/Identification`, `Dossier`
 * (`Nom_Juridiction`, `Numero_Dossier`, `Date_Lecture`, `Type_Decision`,
 * `Type_Recours`, `Solution`) et `Decision/Texte_Integral`. Deux préfixes de
 * fichiers : `DTA_` (décisions) et `ORTA_` (ordonnances).
 *
 * Fonctions pures uniquement (pas de réseau ni de base) : le téléchargement et
 * la persistance vivent dans `veille-ingestion.ts`. Le garde-fou est entier —
 * on ne transporte que des métadonnées et du texte réellement publiés.
 */

import { lireZip } from "@/lib/zip";
import { texteTag, type SourceDila } from "@/lib/veille-dila";

/** Publication possible seulement à partir de ce jour du mois (zip stabilisé). */
export const JOUR_OUVERTURE_TA = 8;

/** Marqueur de reprise dans `AutoAlimentationTrace.detail`. */
export const MARQUEUR_TA_RE = /derniere=(TA_\d{6}\.zip)/;

/**
 * Archive à ingérer pour `date` : le zip du **mois précédent**, mais seulement
 * à partir du 8ᵉ jour (avant, le zip du mois M n'est pas encore stabilisé).
 * Renvoie `null` les jours 1→7 : rien à faire ce jour-là.
 */
export function archiveTaCible(date: Date): string | null {
  if (date.getUTCDate() < JOUR_OUVERTURE_TA) return null;
  const prec = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  const annee = prec.getUTCFullYear();
  const mois = String(prec.getUTCMonth() + 1).padStart(2, "0");
  return `TA_${annee}${mois}.zip`;
}

/** URL complète d'une archive mensuelle (`TA_202609.zip` → `/DTA/2026/09/…`). */
export function urlArchiveTa(nom: string): string {
  const m = nom.match(/^TA_(\d{4})(\d{2})\.zip$/);
  if (!m) throw new Error(`nom d'archive TA invalide : ${nom}`);
  return `https://opendata.justice-administrative.fr/DTA/${m[1]}/${m[2]}/${nom}`;
}

function dateIso(v: string | null): string | null {
  if (!v) return null;
  const m = v.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Analyse un `<Document>` de décision TA. Le titre assemble les métadonnées
 * **publiées** telles quelles (juridiction — type — recours — solution) : ni
 * reformulation, ni interprétation. Pas d'ECLI ni d'URL pérenne sur ce
 * format — `null`, la clé de dédup est le nom du fichier d'identification.
 */
export function analyserXmlTa(xml: string): SourceDila | null {
  const id = texteTag(xml, "Identification");
  if (!id) return null;

  const juridiction = texteTag(xml, "Nom_Juridiction");
  const nature = texteTag(xml, "Type_Decision");
  const recours = texteTag(xml, "Type_Recours");
  const solution = texteTag(xml, "Solution");
  const titre =
    [juridiction, nature, recours, solution].filter(Boolean).join(" — ") ||
    `Décision ${id}`;

  return {
    cle: id,
    id,
    source: "TA",
    nature: nature ?? "DECISION",
    titre,
    juridiction,
    dateDecision: dateIso(texteTag(xml, "Date_Lecture")),
    reference: texteTag(xml, "Numero_Dossier"),
    ecli: null,
    url: null,
    contenu: texteTag(xml, "Texte_Integral") ?? "",
  };
}

/**
 * Parcourt le ZIP mensuel et rend les publications une par une (générateur :
 * le zip complet ne stationne jamais entièrement en mémoire). Les fichiers
 * non-XML et les XML sans balise `Identification` sont ignorés.
 */
export function* lirePublicationsTa(zip: Buffer): Generator<SourceDila> {
  for (const entree of lireZip(zip)) {
    if (!entree.chemin.toLowerCase().endsWith(".xml")) continue;
    const pub = analyserXmlTa(entree.contenu.toString("utf8"));
    if (pub) yield pub;
  }
}

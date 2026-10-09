import { z } from "zod";
import {
  CATEGORIES_DOCUMENT,
  type CategorieDocument,
  type DocV2,
  type ExtractedData,
  type Mesure,
} from "@/lib/moteur";
import type { DocTypeAnalyse } from "@/lib/envoi";

/**
 * OCR v2 (lots N1+N2) — contrat à 4 sections du prompt Gemini, parsing
 * tolérant et miroir clés plates. Module pur : aucun `server-only`, aucune
 * dépendance réseau. Principes :
 *  - **Jamais de donnée fabriquée** : chaque champ est isolé (une valeur
 *    invalide ne fait tomber que ce champ) et les valeurs vides sont écartées ;
 *  - **Anti-hallucination** : `parserDocV2` rend `null` si la racine n'est pas
 *    un objet ou si `categorie` est absente/invalide — le texte brut reste
 *    alors exploitable par les regex (`normaliserPv`) sans struct ;
 *  - **Alignement docType** : `alignerDocType` fait de la catégorie la source
 *    de vérité du `docType` pack (3F/48SI), et le supprime quand la catégorie
 *    n'en a pas (48N, annulation) — jamais de mismatch catégorie/docType.
 */

/** `docType` pack dérivé de la catégorie (source : `alignerDocType`). */
const DOC_TYPE_PAR_CATEGORIE: Record<CategorieDocument, DocTypeAnalyse | undefined> = {
  AMENDE_ANTAI: "AMENDE",
  RETENTION_TERRAIN: "3F",
  SUSPENSION_PREFECTORALE: "3F",
  INVALIDATION_48SI: "48SI",
  PERTE_POINTS_48: undefined,
  ANNULATION_JUDICIAIRE: undefined,
  INCONNU: undefined,
};

/** Libellés UI — même style que `envoi.ts::libelleDocType` (minuscule). */
const LIBELLES_CATEGORIE: Record<CategorieDocument, string> = {
  AMENDE_ANTAI: "avis de contravention (amende)",
  RETENTION_TERRAIN: "rétention du permis (immédiate)",
  SUSPENSION_PREFECTORALE: "suspension préfectorale (3F)",
  INVALIDATION_48SI: "invalidation du permis (48SI)",
  PERTE_POINTS_48: "notification de retrait de points (48N)",
  ANNULATION_JUDICIAIRE: "annulation judiciaire",
  INCONNU: "document non identifié",
};

/** Normalisation défensive d'une catégorie (lecture JSON comme saisie modèle) :
 * minuscules/espaces/tirets acceptés, sinon indéfini — jamais inventée. */
export function normaliserCategorie(v: unknown): CategorieDocument | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return (CATEGORIES_DOCUMENT as readonly string[]).includes(t)
    ? (t as CategorieDocument)
    : undefined;
}

/** Lecture défensive d'une catégorie stockée (`extractedData`). */
export function lireCategorie(v: unknown): CategorieDocument | undefined {
  return normaliserCategorie(v);
}

export function docTypePourCategorie(
  cat: CategorieDocument,
): DocTypeAnalyse | undefined {
  return DOC_TYPE_PAR_CATEGORIE[cat];
}

export function libelleCategorie(cat: CategorieDocument): string {
  return LIBELLES_CATEGORIE[cat];
}

// ---------------------------------------------------------------------------
// Champs tolérants (zod) : jamais d'exception, isolation champ par champ.
// ---------------------------------------------------------------------------

function nombreBrut(v: unknown, min: number, max: number): number | undefined {
  if (typeof v === "number") {
    return Number.isFinite(v) && v >= min && v <= max ? v : undefined;
  }
  if (typeof v !== "string") return undefined;
  const s = v.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

function champTexte(max: number) {
  return z
    .unknown()
    .transform((v): string | undefined => {
      if (typeof v !== "string") return undefined;
      const s = v.replace(/\s+/g, " ").trim().slice(0, max);
      return s || undefined;
    })
    .optional(); // clé absente : zod v4 refuse sinon (« expected nonoptional »)
}

function champDate() {
  return z
    .unknown()
    .transform((v): string | undefined => {
      if (typeof v !== "string") return undefined;
      const s = v.trim();
      // AAAA-MM-JJ strict (mois 01-12, jour 01-31) — jamais une date fabriquée.
      return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s)
        ? s
        : undefined;
    })
    .optional();
}

function champHeure() {
  return z
    .unknown()
    .transform((v): string | undefined => {
      if (typeof v !== "string") return undefined;
      const m = /^([0-2]?\d)[:hH.]([0-5]\d)$/.exec(v.trim());
      if (!m) return undefined;
      const h = Number(m[1]);
      return h <= 23 ? `${String(h).padStart(2, "0")}:${m[2]}` : undefined;
    })
    .optional();
}

function champNombre(min: number, max: number) {
  return z
    .unknown()
    .transform((v): number | undefined => nombreBrut(v, min, max))
    .optional();
}

const UNITES_MESURE = ["mg/L", "g/L", "km/h"] as const;

const schemaMesure = z.unknown().transform((v): Mesure | undefined => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const valeur = nombreBrut(o.chiffre_mesure, 0, 1_000_000);
  if (valeur === undefined) return undefined; // chiffre absent → pas de mesure
  if (typeof o.unite !== "string") return undefined;
  const unite = o.unite.trim();
  if (!(UNITES_MESURE as readonly string[]).includes(unite)) return undefined;
  const retenu = nombreBrut(o.chiffre_retenu, 0, 1_000_000);
  return retenu === undefined
    ? { valeur, unite: unite as Mesure["unite"] }
    : { valeur, unite: unite as Mesure["unite"], retenu };
}).optional(); // clé absente (zod v4)

const schemaStatutImport = z.object({
  identifiant_document: champTexte(40),
  numero_neph_dossier: champTexte(30),
  date_emission_officielle: champDate(),
  date_notification_mentionnee: champDate(),
});

const schemaProfilClient = z.object({
  nom: champTexte(60),
  prenom: champTexte(40),
  adresse_postale_brute: champTexte(140),
});

const schemaFaitsInfraction = z.object({
  date_faits: champDate(),
  heure_faits: champHeure(),
  lieu_exact: champTexte(120),
  nature_infraction_libelle: champTexte(140),
  immatriculation_vehicule: champTexte(20),
});

const schemaImpact = z.object({
  montant_amende_euros: champNombre(0, 100_000),
  retrait_points_encouru: champNombre(0, 14),
  solde_points_apres_infraction: champNombre(0, 14),
  duree_retrait_permis_mois: champNombre(0, 120),
  mesure_technique: schemaMesure,
});

/** Parse une section sans jamais lever ; rend `undefined` si la section est
 * absente, d'un type inattendu, ou vide (aucun champ exploitable). */
function lireSection<S extends z.ZodType>(
  schema: S,
  source: unknown,
): z.output<S> | undefined {
  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    return undefined;
  }
  const r = schema.safeParse(source);
  if (!r.success) return undefined;
  const data = r.data as Record<string, unknown>;
  return Object.values(data).some((v) => v !== undefined)
    ? (r.data as z.output<S>)
    : undefined;
}

/**
 * Parse la réponse structurée du provider (4 sections du prompt). Tolère une
 * forme aplatie (sections rejetées sur la racine) : le prompt reste le
 * contrat, la forme n'est qu'un repli de génération.
 */
export function parserDocV2(brut: unknown): DocV2 | null {
  if (typeof brut !== "object" || brut === null || Array.isArray(brut)) {
    return null;
  }
  const root = brut as Record<string, unknown>;
  const categorie = normaliserCategorie(root.categorie);
  if (!categorie) return null;

  const lu = (nom: string): unknown => {
    const v = root[nom];
    return typeof v === "object" && v !== null && !Array.isArray(v) ? v : root;
  };

  const doc: DocV2 = { categorie };
  const statut = lireSection(schemaStatutImport, lu("statut_import"));
  if (statut) doc.statut_import = statut;
  const profil = lireSection(schemaProfilClient, lu("profil_client"));
  if (profil) doc.profil_client = profil;
  const faits = lireSection(schemaFaitsInfraction, lu("faits_et_infraction"));
  if (faits) doc.faits_et_infraction = faits;
  const impact = lireSection(
    schemaImpact,
    lu("impact_et_sanctions_financieres"),
  );
  if (impact) doc.impact_et_sanctions_financieres = impact;
  return doc;
}

// ---------------------------------------------------------------------------
// Miroir clés plates (Partial<ExtractedData>) — ce que les regex et le
// formulaire connaissent déjà ; `doc_v2`/`mesure` restent des objets (ajoutés
// par `createDossier`, `fusionnerPrefill` ne duplique que les chaînes).
// ---------------------------------------------------------------------------

/** n° d'avis : chiffres seulement, 12 à 16 — sinon indéfini (jamais tronqué). */
function numPvDepuisIdentifiant(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const chiffres = v.replace(/\D/g, "");
  return chiffres.length >= 12 && chiffres.length <= 16
    ? chiffres
    : undefined;
}

function nettoyerNeph(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length >= 6 && s.length <= 20 ? s : undefined;
}

const PLAQUE_SIV_MIRROR = /^[A-Z]{2,3}-\d{2,4}-[A-Z]{2}$/;
const PLAQUE_FNI_MIRROR = /^\d{1,4}-[A-Z]{1,2}-\d{1,3}$/;

/** Plaque normalisée façon `normaliserPv` (segments séparés par tirets) ;
 * format non reconnu → indéfini (la regex sur le texte reprendra le relais). */
function plaqueDepuisStruct(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const s = v
    .toUpperCase()
    .replace(/\s*\([^)]*\)\s*$/, "") // suffixe « (F) » du certificat
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (PLAQUE_SIV_MIRROR.test(s) || PLAQUE_FNI_MIRROR.test(s)) return s;
  return undefined;
}

/**
 * Miroir `DocV2` → clés plates de `ExtractedData`. Ne pose **jamais**
 * `docType` (dérivé par `alignerDocType`) ni les champs regex historiques
 * absents du contrat (prefecture, motif, radar, télépaiement…).
 */
export function aplatirDocV2(doc: DocV2): Partial<ExtractedData> {
  const m: Partial<ExtractedData> = { categorie: doc.categorie, doc_v2: doc };

  const statut = doc.statut_import;
  if (statut) {
    const numPv = numPvDepuisIdentifiant(statut.identifiant_document);
    if (numPv) m.num_pv = numPv;
    const neph = nettoyerNeph(statut.numero_neph_dossier);
    if (neph) m.neph = neph;
    if (statut.date_emission_officielle) {
      m.dateEmission = statut.date_emission_officielle;
    }
    if (statut.date_notification_mentionnee) {
      m.dateNotification = statut.date_notification_mentionnee;
    }
  }

  const profil = doc.profil_client;
  if (profil) {
    const nom = [profil.nom, profil.prenom]
      .map((p) => p?.trim())
      .filter(Boolean)
      .join(" ");
    if (nom) m.nom = nom;
    if (profil.adresse_postale_brute) m.adresse = profil.adresse_postale_brute;
  }

  const faits = doc.faits_et_infraction;
  if (faits) {
    if (faits.date_faits) m.date = faits.date_faits;
    if (faits.heure_faits) {
      m.heure = faits.heure_faits.replace(/^(\d{2}):(\d{2})$/, "$1h$2");
    }
    if (faits.lieu_exact) m.lieu = faits.lieu_exact;
    if (faits.nature_infraction_libelle) {
      const libelle = faits.nature_infraction_libelle
        .replace(/\s*[-–—]+$/, "")
        .trim();
      if (libelle) m.libelleInfraction = libelle;
    }
    const plaque = plaqueDepuisStruct(faits.immatriculation_vehicule);
    if (plaque) m.plaque = plaque;
  }

  const impact = doc.impact_et_sanctions_financieres;
  if (impact) {
    if (impact.montant_amende_euros !== undefined) {
      m.montant = `${impact.montant_amende_euros.toFixed(2).replace(".", ",")} €`;
    }
    if (impact.retrait_points_encouru !== undefined) {
      m.pointsEncourus = String(impact.retrait_points_encouru);
    }
    if (impact.solde_points_apres_infraction !== undefined) {
      m.soldePoints = String(impact.solde_points_apres_infraction);
    }
    if (impact.duree_retrait_permis_mois !== undefined) {
      m.duree = `${impact.duree_retrait_permis_mois} mois`;
    }
    if (impact.mesure_technique) m.mesure = impact.mesure_technique;
  }

  return m;
}

/**
 * Aligne `docType` (et valide `categorie`) sur la catégorie OCR v2 :
 *  - catégorie **absente** → no-op (anciens dossiers : leur docType survit) ;
 *  - catégorie **invalide** → les deux clés sont supprimées (jamais de
 *    classification fabriquée) ;
 *  - catégorie **valide** → `docType` = mapping de la catégorie, ou supprimé
 *    si la catégorie n'a pas d'équivalent pack (48N, annulation, INCONNU).
 */
export function alignerDocType(data: Record<string, unknown>): void {
  const brut = data.categorie;
  if (brut === undefined || brut === null) return;
  const cat = normaliserCategorie(brut);
  if (!cat) {
    delete data.categorie;
    delete data.docType;
    return;
  }
  data.categorie = cat;
  const docType = docTypePourCategorie(cat);
  if (docType) data.docType = docType;
  else delete data.docType;
}

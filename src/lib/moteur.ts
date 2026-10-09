import { formaterDateFr } from "./envoi";
import { ajouterJoursFrances, reporterJourOuvrable } from "./delais";

/**
 * Catégories documentaires (OCR v2, lots N1+N2) : classement sémantique du
 * document scanné, plus fin que le `docType` pack (3F/48SI). Les deux restent
 * alignés par `docTypePourCategorie`/`alignerDocType` (`doc-v2.ts`) : une
 * catégorie sans équivalent pack (48N, annulation judiciaire) n'impose aucun
 * `docType` — le moteur n'applique alors aucune règle cloisonnée.
 * Jamais fabriquée : les regex n'écrivent une catégorie que si le texte est
 * reconnu ; `INCONNU` vient uniquement du provider structuré (Gemini).
 */
export const CATEGORIES_DOCUMENT = [
  "AMENDE_ANTAI",
  "RETENTION_TERRAIN",
  "SUSPENSION_PREFECTORALE",
  "INVALIDATION_48SI",
  "PERTE_POINTS_48",
  "ANNULATION_JUDICIAIRE",
  "INCONNU",
] as const;
export type CategorieDocument = (typeof CATEGORIES_DOCUMENT)[number];

/** Mesure technique lue sur le document (alcootest mg/L, vitesse km/h). */
export type Mesure = {
  valeur: number;
  unite: "mg/L" | "g/L" | "km/h";
  /** Valeur retenue par l'administration si distincte de la mesure (optionnelle). */
  retenu?: number;
};

/** Section « statut_import » du contrat OCR v2 (identification du document). */
export type DocV2StatutImport = {
  identifiant_document?: string;
  numero_neph_dossier?: string;
  date_emission_officielle?: string;
  date_notification_mentionnee?: string;
};

/** Section « profil_client » du contrat OCR v2 (titulaire). */
export type DocV2ProfilClient = {
  nom?: string;
  prenom?: string;
  adresse_postale_brute?: string;
};

/** Section « faits_et_infraction » du contrat OCR v2. */
export type DocV2FaitsInfraction = {
  date_faits?: string;
  heure_faits?: string;
  lieu_exact?: string;
  nature_infraction_libelle?: string;
  immatriculation_vehicule?: string;
};

/** Section « impact_et_sanctions_financieres » du contrat OCR v2. */
export type DocV2ImpactSanctions = {
  montant_amende_euros?: number;
  retrait_points_encouru?: number;
  solde_points_apres_infraction?: number;
  duree_retrait_permis_mois?: number;
  mesure_technique?: Mesure;
};

/**
 * Document structuré extrait par l'OCR v2 : le prompt impose ces 4 sections
 * (valeurs absentes = null), le parser (`doc-v2.ts`) isole chaque champ et
 * n'indexe une section que si elle porte au moins une donnée.
 */
export type DocV2 = {
  categorie: CategorieDocument;
  statut_import?: DocV2StatutImport;
  profil_client?: DocV2ProfilClient;
  faits_et_infraction?: DocV2FaitsInfraction;
  impact_et_sanctions_financieres?: DocV2ImpactSanctions;
};

export type ExtractedData = {
  nom?: string;
  plaque?: string;
  num_pv?: string;
  date?: string; // ISO yyyy-mm-dd
  heure?: string;
  numTelePaiement?: string;
  cle?: string;
  montant?: string;
  typeRadar?: string;
  radarId?: string;
  adresse?: string; // adresse du titulaire / lieu - vérifiable
  lieu?: string; // lieu de l'infraction (AMENDE) ou lieu de rétention (SUSPENSION)
  prefecture?: string; // préfecture émettrice (SUSPENSION)
  duree?: string; // durée de suspension (SUSPENSION)
  motif?: string; // motif de suspension (alcool, stup, vitesse...)
  conditions_meteo?: string;
  travaux_présents?: boolean;
  plaqueIncorrecte?: boolean;
  adresseIncorrecte?: boolean;
  preuveEtalonnage?: string;
  /** Date de vérification périodique du cinémomètre, lue sur le PV (rubrique
   * « Appareil de contrôle homologué ») — base de la preuve d'entretien. */
  dateVerificationAppareil?: string;
  // Questionnaire ciblé (flux A, étape 2) : contexte apporté par le client,
  // exploité par le juriste lors de la validation humaine.
  paiementDejaFait?: boolean;
  vehiculeCede?: boolean;
  vehiculeVole?: boolean;
  conducteurDifferent?: boolean;
  // Débit différé du crédit (« paiement déjà signalé ») : `false` = analysé
  // sans débit, en attente de la validation juriste ; `true` = débité à la
  // validation. Absent = flux historique (débit à l'analyse, ou jamais débité).
  creditConsome?: boolean;
  // Questionnaire dynamique (registre `questions.ts`, écrit par `lireReponses`)
  // — contexte juriste + preuves externes, jamais un fondement à lui seul.
  stationnementPanneau?: boolean;
  stationnementGene?: boolean;
  stationnementTicket?: boolean;
  stationnementLieu?: boolean;
  suspNotifIrreguliere?: boolean;
  suspDelaiNotification?: boolean;
  suspMotifsAbsents?: boolean;
  suspObservations?: boolean;
  suspEthylometreCarnet?: boolean;
  suspSecondSouffle?: boolean;
  suspRefereEngage?: boolean;
  // Pack 3F/48SI (Télérecours Citoyens) — classificateur de document
  // (AMENDE / 3F / 48SI) et champs temporels du pack. Jamais inventés : extrait
  // par libellé (OCR) ou saisis par l'humain ; le moteur ne conclut que si les
  // valeurs existent. Les règles pack ne portent que 3F/48SI (`DocTypeDocument`)
  // : un document classé AMENDE ne déclenche donc jamais une règle de pack.
  docType?: "AMENDE" | "3F" | "48SI";
  dateSignatureArrete?: string; // date de signature de l'arrêté / de la 48SI
  heureSignatureArrete?: string;
  /** Cumul de retraits de points le même jour — nombre si l'OCR l'a lu
   * directement, chaîne après passage par `fusionnerPrefill` (les
   * `Record<string, string>` du dépôt stockent tout en texte ; `valeurSuperieure`
   * convertit les deux formes). */
  pointsRetiresMemesDate?: number | string;
  dateStage?: string; // date d'attestation de stage de récupération
  dateNotification?: string; // date de notification de la décision 48SI
  // OCR v2 (lots N1+N2) : classification documentaire + contrat à 4 sections.
  // `categorie` est écrite par les regex seulement si le texte est reconnu
  // (jamais INCONNU côté regex) ; `doc_v2` conserve la structure d'origine du
  // provider. Les clés plates (neph, libelleInfraction, dateEmission,
  // soldePoints, pointsEncourus) sont le miroir exploitable par les règles —
  // miroir assuré par `aplatirDocV2` + alignement par `alignerDocType`.
  categorie?: CategorieDocument;
  doc_v2?: DocV2;
  neph?: string;
  libelleInfraction?: string;
  dateEmission?: string;
  /** Nombre (provider) ou chaîne (après `fusionnerPrefill`) — comme
   * `pointsRetiresMemesDate`, `valeurSuperieure` lit les deux formes. */
  soldePoints?: number | string;
  pointsEncourus?: number | string;
  mesure?: Mesure;
  // Référé-suspension (art. L. 521-2 CJA) — **noms identiques aux variables
  // du template** (`{metier}`, `{entreprise}`, `{risque_licenciement}`) : un
  // renommage en `urgence*` casserait `remplirTemplate` (jamais de copie
  // intermédiaire). Saisie formulaire, jamais inventés.
  metier?: string;
  entreprise?: string;
  risque_licenciement?: string;
};

/**
 * Ids calibrés = les 4 failles AMENDE seedées et validées (`FAILLES.md` §A).
 * Synchronisation stricte avec `prisma/seed.ts` — un id absent de la base ne
 * peut être ni détecté ni scoré « calibré » (audit lot 5 : les 6 ids
 * fantômes « questionnaire » — travaux/meteo/cession/conducteur/paiement/
 * adresse — n'existaient en base sur aucun environnement ; leur déclenchement
 * passe par `reglesDetection` des failles réelles, jamais par un id inventé).
 */
export const FAILLE_IDS = {
  prescription: "faille-prescription-1-an",
  mentions: "faille-mentions-obligatoires",
  erreurPlaque: "faille-erreur-plaque",
  etalonnage: "faille-certificat-etalonnage",
} as const;

export function datePrescrite(datePv?: string): boolean {
  if (!datePv) return false;
  const d = new Date(`${datePv}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() > 365 * 24 * 3600 * 1000;
}

/**
 * Délai réglementaire de contestation : 45 jours pour une amende forfaitaire,
 * 2 mois pour un recours gracieux de suspension de permis — jours **francs**
 * (le jour du PV n'est pas compté), reporté au prochain jour ouvrable s'il
 * expire un week-end ou un jour férié (`src/lib/delais.ts`).
 * Retourne null si la date du PV est absente ou invalide.
 */
export function dateLimitePv(
  datePv?: string,
  type?: string,
): Date | null {
  if (!datePv) return null;
  const d = new Date(`${datePv}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const jours = type === "SUSPENSION" ? 60 : 45;
  return reporterJourOuvrable(ajouterJoursFrances(d, jours));
}

export function joursRestants(dateLimite?: Date | null): number {
  if (!dateLimite) return Number.POSITIVE_INFINITY;
  const restant = Math.ceil(
    (dateLimite.getTime() - Date.now()) / (24 * 3600 * 1000),
  );
  return restant + 0; // normalise -0 → 0
}

/**
 * Un radar doit disposer d'un certificat d'étalonnage valide le jour de
 * l'infraction. Si le certificat était expiré, la contravention est
 * contestable (faille "certificat d'étalonnage").
 */
export function etalonnageExpire(
  dateExpiration?: Date | string | null,
  datePv?: string,
): boolean {
  if (!dateExpiration || !datePv) return false;
  const exp = new Date(dateExpiration);
  const pv = new Date(`${datePv}T00:00:00Z`);
  if (Number.isNaN(exp.getTime()) || Number.isNaN(pv.getTime())) return false;
  return pv.getTime() > exp.getTime();
}

/** Date « yyyy-mm-dd » ou « dd/mm/yyyy » → Date UTC à minuit ; null si
 * illisible (jamais de date fabriquée). */
function versDateUtc(valeur: string): Date | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur.trim());
  const fr = iso
    ? null
    : /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(valeur.trim());
  const isoFinal = iso
    ? `${iso[1]}-${iso[2]}-${iso[3]}`
    : fr
      ? `${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}`
      : null;
  if (!isoFinal) return null;
  const d = new Date(`${isoFinal}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Échéance de la vérification périodique d'un cinémomètre : date de
 * vérification **+1 an** (vérification annuelle obligatoire), sauf exception
 * des postes fixes — les 2 premières vérifications suivant la mise en service
 * peuvent être espacées de 2 ans (arrêté du 4 juin 2009) : on applique alors
 * +2 ans quand la date d'installation (liste officielle data.gouv.fr) est
 * connue et que la vérification lue a lieu dans les 26 mois de cette
 * installation. Retourne null si une date est absente ou illisible.
 */
export function echeanceVerificationRadar(
  dateVerification?: string | null,
  dateInstallation?: string | null,
): Date | null {
  const verif = dateVerification ? versDateUtc(dateVerification) : null;
  if (!verif) return null;
  const echeance = new Date(verif);
  echeance.setUTCFullYear(echeance.getUTCFullYear() + 1);
  if (dateInstallation) {
    const inst = versDateUtc(dateInstallation.slice(0, 10));
    if (inst) {
      const moisEcoules =
        (verif.getTime() - inst.getTime()) / (30 * 24 * 3600 * 1000);
      if (moisEcoules >= 0 && moisEcoules <= 26) {
        echeance.setUTCFullYear(echeance.getUTCFullYear() + 1);
      }
    }
  }
  return echeance;
}

/** Rafales (km/h) à partir desquelles le résumé météo est retenu : seuil
 * opérationnel d'aide à la décision, pas un seuil juridique. */
const RAFales_KMH_RETENUES = 70;

/**
 * Conditions météo « défavorables » au sens de la faille visibilité : pluie,
 * bruine, neige, brouillard, verglas, grêle, orage ou tempête — ou, à défaut
 * d'un mot-clé, des rafales fortes (`Rafales: 75 km/h`). Règle partagée par le
 * moteur (détection) et les preuves (une preuve météo n'est versée que si elle
 * caractérise réellement cette faille — jamais une simple journée clémente).
 */
export function meteoDefavorable(conditions?: string | null): boolean {
  if (!conditions) return false;
  const texte = String(conditions);
  if (/pluie|bruine|neige|brouillard|verglas|grêle|orage|tempête/i.test(texte)) {
    return true;
  }
  const rafales = texte.match(/rafales:\s*(\d+)/i);
  return !!rafales && Number(rafales[1]) >= RAFales_KMH_RETENUES;
}

export function detecterFaille(
  data: ExtractedData,
  failles: { id: string }[],
  contexte?: { dateExpirationEtalonnage?: Date | string | null },
): { id: string } | null {
  const premier = detecterFailles(data, null, failles, contexte)[0];
  return premier ? { id: premier } : null;
}

/**
 * Règles de détection automatique d'une faille (base juridique auto-alimentée).
 * Évaluées sur les données extraites (OCR + saisie humaine) et sur le texte
 * brut scanné du PV/lettre (Dossier.pvTexte).
 */
export type RegleDetection =
  | { type: "champAbsent"; champ: string }
  | { type: "datePrescrite" }
  | { type: "plaqueIncorrecte" }
  | { type: "etalonnageExpire" }
  | { type: "travauxPresents" }
  | { type: "meteoDefavorable" }
  | { type: "vehiculeCede" }
  | { type: "vehiculeVole" }
  | { type: "conducteurDifferent" }
  | { type: "paiementDejaFait" }
  | { type: "adresseIncorrecte" }
  | { type: "texteContient"; motif: string }
  | { type: "texteAbsent"; motif: string }
  // --- Pack 3F/48SI (types **additifs** — les types ci-dessus sont intacts) ---
  /** Délai horodaté dépassé entre deux événements du document
   * (ex. contrôle → signature de l'arrêté : 72 h / 120 h — L. 224-2 CR).
   * N'exige les deux horodatages que si présents : jamais de contexte fabriqué. */
  | {
      type: "delaiDepasse";
      limiteHeures: number;
      /** Sous-condition sur une donnée extraite (ex. motif « vitesse » → 72 h,
       * « alcool » → 120 h) ; sans `siChamp`, la règle s'applique toujours. */
      siChamp?: { champ: string; valeur: string };
    }
  /** Deux dates extraites, l'une strictement antérieure à l'autre
   * (ex. stage effectué avant la notification 48SI). */
  | { type: "datePrealable"; champ: string; reference: string }
  /** Valeur numérique extraite strictement supérieure à un seuil
   * (ex. cumul de retraits de points le même jour > 8 — L. 223-2/R. 223-2 CR). */
  | { type: "valeurSuperieure"; champ: string; seuil: number }
  /** Composition ET (les règles d'une même faille sont sinon en OU). */
  | { type: "et"; regles: RegleDetection[] };

/** Garde de cloisonnement : une règle portant `docType` ne matche que si le
 * document a été classé du même type (3F ≠ 48SI) — jamais de candidature
 * croisée. */
export type DocTypeDocument = "3F" | "48SI";

export type FailleDetectable = {
  id: string;
  reglesDetection?: RegleDetection[] | null;
};

// Ordre de priorité de restitution des candidates (les 4 failles seedées) :
// prescription > erreur de plaque > étalonnage > mentions.
const PRIORITE_DETECTION = [
  FAILLE_IDS.prescription,
  FAILLE_IDS.erreurPlaque,
  FAILLE_IDS.etalonnage,
  FAILLE_IDS.mentions,
];

// Ordre du pack 3F/48SI : évalué **après** les 4 failles calibrées (jamais de
// régression AMENDE) et avant les autres failles SUSPENSION du catalogue —
// la première candidate reste la principale retenue.
const PRIORITE_PACK: string[] = [
  "faille-3f-delai-retention",
  "faille-3f-incompetence",
  "faille-3f-defaut-motivation",
  "faille-48si-defaut-info",
  "faille-48si-plafond-8pts",
  "faille-48si-stage-avant-notification",
];

/**
 * Retourne les ids de TOUTES les failles candidates (dans l'ordre de
 * priorité). Une faille est candidate si l'une au moins de ses règles matche
 * (sémantique OU). Sans règles explicites, on retombe sur les prédicats
 * hérités pour les 4 failles connues ; une faille inconnue sans règle n'est
 * jamais détectée seule.
 */
export function detecterFailles(
  data: ExtractedData,
  texte: string | null | undefined,
  failles: FailleDetectable[],
  contexte?: { dateExpirationEtalonnage?: Date | string | null },
): string[] {
  const byId = new Map(failles.map((f) => [f.id, f]));
  const connues = [...PRIORITE_DETECTION, ...PRIORITE_PACK].filter((id) =>
    byId.has(id),
  );
  const autres = failles
    .filter(
      (f) =>
        !PRIORITE_DETECTION.includes(
          f.id as (typeof PRIORITE_DETECTION)[number],
        ) && !PRIORITE_PACK.includes(f.id),
    )
    .map((f) => f.id);

  const candidates: string[] = [];
  for (const id of [...connues, ...autres]) {
    const faille = byId.get(id);
    if (faille && reglesMatchent(faille, data, texte, contexte)) {
      candidates.push(id);
    }
  }
  return candidates;
}

function reglesMatchent(
  faille: FailleDetectable,
  data: ExtractedData,
  texte: string | null | undefined,
  contexte?: { dateExpirationEtalonnage?: Date | string | null },
): boolean {
  if (faille.reglesDetection && faille.reglesDetection.length > 0) {
    return faille.reglesDetection.some((regle) =>
      evalRegle(regle, data, texte, contexte),
    );
  }
  return predicatHerite(faille.id, data, texte, contexte);
}

function evalRegle(
  regle: RegleDetection,
  data: ExtractedData,
  texte: string | null | undefined,
  contexte?: { dateExpirationEtalonnage?: Date | string | null },
): boolean {
  // Garde de docType : une règle réservée au 3F (ou au 48SI) ne matche jamais
  // sur un document de l'autre type — cloisonnement strict du pack.
  const docTypeRegle = (regle as { docType?: DocTypeDocument }).docType;
  if (docTypeRegle && data.docType !== docTypeRegle) return false;
  switch (regle.type) {
    case "champAbsent": {
      const valeur = (data as Record<string, unknown>)[regle.champ];
      return valeur == null || valeur === "";
    }
    case "datePrescrite":
      return datePrescrite(data.date);
    case "plaqueIncorrecte":
      return data.plaqueIncorrecte === true;
    case "etalonnageExpire":
      return (
        !!contexte?.dateExpirationEtalonnage &&
        etalonnageExpire(contexte.dateExpirationEtalonnage, data.date)
      );
    case "travauxPresents":
      return (data as Record<string, unknown>).travaux_présents === true || (data as Record<string, unknown>).travaux === true;
    case "meteoDefavorable":
      return meteoDefavorable(
        (data as Record<string, unknown>).conditions_meteo as string | undefined,
      );
    case "vehiculeCede":
      return (data as Record<string, unknown>).vehiculeCede === true;
    case "vehiculeVole":
      return (data as Record<string, unknown>).vehiculeVole === true;
    case "conducteurDifferent":
      return (data as Record<string, unknown>).conducteurDifferent === true;
    case "paiementDejaFait":
      return (data as Record<string, unknown>).paiementDejaFait === true;
    case "adresseIncorrecte":
      return (data as Record<string, unknown>).adresseIncorrecte === true;
    case "texteContient":
      return (
        !!texte && texte.toLowerCase().includes(regle.motif.toLowerCase())
      );
    case "texteAbsent":
      // Anti-faux-positif : l'absence d'une mention ne déclenche que si le
      // texte ressemble réellement à un PV/lettre (données extraites ou mots
      // clés) — un texte arbitraire ne doit pas matcher « mention absente ».
      return (
        !!texte &&
        texteDePv(texte, data) &&
        !texte.toLowerCase().includes(regle.motif.toLowerCase())
      );
    case "delaiDepasse": {
      if (regle.siChamp) {
        const brut = (data as Record<string, unknown>)[regle.siChamp.champ];
        const valeur = brut == null ? "" : String(brut);
        if (!valeur.toLowerCase().includes(regle.siChamp.valeur.toLowerCase())) {
          return false;
        }
      }
      const debut = horodatage(data.date, data.heure);
      const fin = horodatage(data.dateSignatureArrete, data.heureSignatureArrete);
      if (!debut || !fin) return false;
      const heures = (fin.getTime() - debut.getTime()) / 3_600_000;
      return heures > regle.limiteHeures;
    }
    case "datePrealable": {
      const a = champEnDate(data, regle.champ);
      const b = champEnDate(data, regle.reference);
      if (!a || !b) return false;
      return a.getTime() < b.getTime();
    }
    case "valeurSuperieure": {
      const brut = (data as Record<string, unknown>)[regle.champ];
      const n =
        typeof brut === "number"
          ? brut
          : brut == null || brut === ""
            ? Number.NaN
            : Number(String(brut).replace(",", "."));
      return Number.isFinite(n) && n > regle.seuil;
    }
    case "et":
      return regle.regles.every((r) => evalRegle(r, data, texte, contexte));
  }
}

/** Date ISO/fr + heure optionnelle (« 14:30 », « 8h05 ») → Date UTC ;
 * null si la date est absente ou illisible (jamais d'horodatage fabriqué). */
function horodatage(
  date: string | undefined,
  heure: string | undefined,
): Date | null {
  const base = date ? versDateUtc(date) : null;
  if (!base) return null;
  const h = heure ? /^(\d{1,2})[:hH]?(\d{2})/.exec(heure.trim()) : null;
  if (h) {
    const heures = Number(h[1]);
    const minutes = Number(h[2]);
    if (heures <= 23 && minutes <= 59) {
      base.setUTCHours(heures, minutes, 0, 0);
    }
  }
  return base;
}

/** Valeur de champ lue comme date (yyyy-mm-dd ou dd/mm/yyyy) → UTC. */
function champEnDate(data: ExtractedData, champ: string): Date | null {
  const brut = (data as Record<string, unknown>)[champ];
  if (brut == null || brut === "") return null;
  return versDateUtc(String(brut));
}

/** Le texte ressemble-t-il à un avis/lettre de PV ? (anti-faux-positifs). */
function texteDePv(texte: string, data: ExtractedData): boolean {
  if (data.num_pv || data.plaque || data.date) return true;
  return /(contravention|suspension|amende|avis|d[eé]cision|infraction|pv\b|n[°o]\s?\d)/i.test(
    texte,
  );
}

// Prédicats hérités — chaque question du questionnaire mappe immédiatement à une faille
function predicatHerite(
  id: string,
  data: ExtractedData,
  _texte: string | null | undefined,
  contexte?: { dateExpirationEtalonnage?: Date | string | null },
): boolean {
  const d = data as Record<string, unknown>;
  switch (id) {
    case FAILLE_IDS.prescription:
      return datePrescrite(data.date);
    case FAILLE_IDS.erreurPlaque:
      return data.plaqueIncorrecte === true;
    case FAILLE_IDS.mentions:
      return !data.numTelePaiement || !data.cle || d.adresseIncorrecte === true;
    case FAILLE_IDS.etalonnage:
      return !!contexte?.dateExpirationEtalonnage && etalonnageExpire(contexte.dateExpirationEtalonnage, data.date);
    default:
      return false;
  }
}

/**
 * Remplit les variables `{...}` d'un template avec les données extraites.
 * Une date ISO (`AAAA-MM-JJ`) est écrite en toutes lettres (qualité rédaction
 * française) ; une variable non renseignée est retirée proprement (avec son
 * éventuel déterminant « n° » précédent) pour ne jamais laisser `{x}` brut
 * dans une lettre.
 */
export function remplirTemplate(
  template: string,
  data: ExtractedData,
): string {
  const rempli = template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = (data as Record<string, string | boolean | undefined>)[key];
    if (value === undefined || value === null) return match;
    const dateFr = typeof value === "string" ? formaterDateFr(value) : "";
    return dateFr || String(value);
  });
  return nettoyerLettre(rempli);
}

/**
 * Nettoyage rédactionnel final d'une lettre : supprime les variables
 * `{...}` encore non renseignées et les artefacts laissés derrière elles
 * (« n° », espaces, doublons de ponctuation). Ne supprime jamais du texte
 * juridique — aucune invention.
 */
export function nettoyerLettre(texte: string): string {
  return texte
    .replace(/\{[\w-]+\}/g, "")
    .replace(/\bn°\s*([,.])/g, "$1")
    .replace(/\bn°\s+(?=\.|,|$)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .replace(/[ \t]+([:;!?])/g, " $1")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+|\s+$/g, "");
}

export type FailleLettre = {
  id: string;
  titreFaille: string;
  articleLoi: string;
  templateLettre: string;
};

/**
 * Lettre de contestation multi-arguments : fond toutes les failles
 * détectées/confirmées en une seule lettre fluide, rédigée comme un courrier
 * professionnel — identification une seule fois, puis chacun des arguments
 * s'enchaîne paragraphiquement (aucune étiquette « Argument n° 1, 2… », aucun
 * sous-titre), et une seule conclusion finale portant la demande. Seules les
 * sources validées par l'admin sont utilisées — les modèles `templateLettre`
 * tels quels, jamais de texte inventé.
 *
 * Une seule faille → comportement identique à remplirTemplate (aucune
 * régression sur les lettres existantes).
 */
export function remplirLettreMulti(
  failles: FailleLettre[],
  data: ExtractedData,
): string | null {
  if (!failles || failles.length === 0) return null;
  if (failles.length === 1) {
    return remplirTemplate(failles[0].templateLettre, data);
  }

  const decouper = (corps: string) =>
    corps
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);

  // Paragraphe purement conclusif (demande finale) : il ne doit apparaître
  // qu'une seule fois, en clôture de la lettre. Les paragraphes d'argumentation
  // qui se terminent par une demande (ex. « … et m'exonérer du paiement »)
  // restent intégrés au corps, sans être dupliqués en conclusion.
  const estConclusionSeule = (p: string) =>
    /^\s*(En conséquence,|Cette contestation est dès lors fondée|Par conséquent,|Je vous demande en conséquence|Je vous prie dès lors)/i.test(
      p,
    );
  const estIdentification = (p: string) => /^\s*Je soussigné/i.test(p);

  const blocs: string[] = [];
  let conclusionFinale: string | null = null;

  failles.forEach((faille, i) => {
    const paragraphes = decouper(remplirTemplate(faille.templateLettre, data));
    const corps = paragraphes.filter((p) => !estConclusionSeule(p));
    const conclusionSeule = paragraphes.find(estConclusionSeule) ?? null;
    if (!conclusionFinale && conclusionSeule) conclusionFinale = conclusionSeule;

    if (i === 0) {
      // La première faille porte l'identification complète + son argumentation.
      blocs.push(...corps);
      return;
    }
    // Les suivantes ne répètent ni l'identification (premier paragraphe), ni
    // la conclusion. Seule l'argumentation propre est conservée ; une section
    // ne doit jamais être vidée (faille monopharagraphique → texte entier).
    const premiere = paragraphes[0];
    const sansIdentification = estIdentification(premiere)
      ? corps.slice(1)
      : corps;
    const sansConclusion = sansIdentification.filter(
      (p) => p !== conclusionSeule,
    );
    const conserve = sansConclusion.length > 0 ? sansConclusion : sansIdentification;
    if (conserve.some((p) => p)) blocs.push(...conserve);
  });

  if (conclusionFinale) blocs.push(conclusionFinale);
  return blocs.join("\n\n");
}

/**
 * Failles dont la confiance a été calibrée juridiquement (base de 100 >= 1 règle
 * corroborante). Toute autre faille reste « à analyser » : une règle unique qui
 * matche prouve au mieux que la faille est CANDIDATE, pas qu'elle aboutira.
 * L'identifiant est la clé de calibration — l'ajouter ici est un acte
 * juridique (validation juriste), jamais une conséquence technique.
 */
const FAILLES_CALIBREES = new Set<string>(Object.values(FAILLE_IDS));

/** Plafond d'un score non calibré : on dit « à analyser », jamais « réussi ». */
export const SCORE_NON_CALIBRE = 45;

/** Un dossier n'est « solide » qu'avec au moins deux règles corroborantes. */
export const SEUIL_SOLIDE = 2;

/**
 * Score d'une faille — pondéré par faille + preuves + questionnaire.
 *
 * IMPORTANT — ce score n'est PAS une probabilité de succès. Il mesure la
 * corroboration documentaire d'un motif. Un dossier contesté peut être rejeté
 * malgré un score élevé : l'OMP dispose d'un large pouvoir d'appréciation.
 *
 * `calibree` distingue les failles validées par un juriste des failles de
 * catalogue : une règle unique qui matche sur une faille non calibrée plafonne
 * à SCORE_NON_CALIBRE, car une seule condition remplie ne prouve pas le motif.
 *
 * Retourne null si non candidate. Ne constitue pas un avis juridique.
 */
export function scoreFaille(
  faille: FailleDetectable,
  data: ExtractedData,
  texte: string | null | undefined,
  contexte?: { dateExpirationEtalonnage?: Date | string | null },
): { matchees: number; total: number; score: number; calibree: boolean } | null {
  const regles = faille.reglesDetection ?? [];
  let matchees = 0;
  let total = 0;
  if (regles.length > 0) {
    for (const regle of regles) {
      total += 1;
      if (evalRegle(regle, data, texte, contexte)) matchees += 1;
    }
  } else {
    total = 1;
    if (predicatHerite(faille.id, data, texte, contexte)) matchees = 1;
  }
  if (matchees === 0) return null;
  const calibree = FAILLES_CALIBREES.has(faille.id);
  let base = Math.round((matchees / total) * 100);

  // Pondération pointue par faille + preuves + questionnaire
  const d = data as Record<string, unknown>;
  let bonus = 0;
  let malus = 0;

  switch (faille.id) {
    case FAILLE_IDS.prescription:
      base = 88;
      if (texte && /prescription|délai/i.test(texte)) bonus += 7;
      break;
    case FAILLE_IDS.erreurPlaque:
      base = d.plaqueIncorrecte ? 98 : base;
      if (!d.plaque) malus += 15;
      break;
    case FAILLE_IDS.mentions:
      base = matchees >= 2 ? 92 : 72;
      break;
    case FAILLE_IDS.etalonnage:
      base = 82;
      if (d.preuveEtalonnage || contexte?.dateExpirationEtalonnage) bonus += 13;
      if (d.lieu) bonus += 5;
      break;
    default:
      if (texte && texte.length > 200) bonus += 3;
      break;
  }

  // Bonus questionnaire global — affine tout scoring (très pointu, chaque réponse fait évoluer)
  if (d.vehiculeCede) bonus += 12;
  if (d.vehiculeVole) bonus += 10;
  if (d.conducteurDifferent) bonus += 9;
  // « Déjà payé » ne majorait plus le score : un paiement n'est pas un
  // argument de contestation (garde-fou « amende déjà payée »).
  if (d.travaux_présents) bonus += 14;
  if (d.conditions_meteo) bonus += 10;
  if (d.adresseIncorrecte) bonus += 8;
  if (d.plaqueIncorrecte && faille.id !== FAILLE_IDS.erreurPlaque) bonus += 6;
  if (d.adresse && d.lieu) bonus += 4;
  // Preuve textuelle renforce
  if (texte && d.adresse && texte.toLowerCase().includes(String(d.adresse).toLowerCase().slice(0, 8))) bonus += 4;

  // Plafond de corroboration — jamais un % de réussite.
  // - faille non calibrée : une règle unique prouvait un ratio de 100 puis un
  //   plafond à 98, d'où un score fabriqué. Plafond à SCORE_NON_CALIBRE.
  // - faille calibrée dont la base a été fixée à la main (switch ci-dessus) :
  //   on respecte la calibration juriste existante.
  // - faille calibrée multi-règles dont une seule matche : corroboration
  //   insuffisante, on plafonne à 60 (« à analyser »).
  const plafond = !calibree
    ? SCORE_NON_CALIBRE
    : total >= SEUIL_SOLIDE && matchees < SEUIL_SOLIDE
      ? 60
      : 98;
  const score = Math.max(0, Math.min(plafond, base + bonus - malus));
  return { matchees, total, score, calibree };
}
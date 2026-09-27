/**
 * Interrogation de sources publiques pour constituer des preuves annexes à la
 * contestation (météo, fiche radar, travaux). Chaque fonction est best-effort :
 * aucun appel ne peut faire échouer un flux. En cas d'erreur réseau, de source
 * indisponible ou d'absence de résultat, on retourne null/[] et aucune preuve
 * n'est enregistrée — on ne référence jamais une preuve non réellement
 * récupérée (garde-fou anti-hallucination).
 */

import type { PrismaClient } from "@/generated/prisma/client";
import type { InfractionType } from "./envoi";
import { meteoDefavorable } from "./moteur";

/* ---------- Pertinence des preuves selon la faille retenue ---------------- */

export type TypePreuveExterne = "METEO" | "RADAR" | "TRAVAUX";

/**
 * Chaque preuve externe n'est récupérée à l'analyse que si une faille du
 * dossier la rend pertinente (mapping faille → types de preuves). Hors
 * mapping, aucune preuve d'un type donné n'est cherchée — une preuve hors-sujet
 * ne serait jamais versée ni citée dans la lettre. La relance manuelle du
 * juriste (recupererPreuvesApi) vérifie l'existant : une preuve déjà
 * identifiée n'est pas re-créée (anti-redondance).
 */
const PREUVES_PAR_FAILLE: Record<string, TypePreuveExterne[]> = {
  "faille-certificat-etalonnage": ["RADAR"],
  "faille-etalonnage-jurisprudence": ["RADAR"],
  "faille-homologation-radar": ["RADAR"],
  "faille-travaux-signalisation": ["TRAVAUX"],
  "faille-panneau-non-conforme": ["TRAVAUX"],
  "faille-meteo-visibilite": ["METEO"],
};

/**
 * Types de preuves externes pertinents pour un ensemble de failles candidates
 * (IDs = slugs FAILLE_IDS/id de la base). Fonction pure, testée.
 */
export function typesPreuvesPourFailles(faillesIds: Iterable<string>): Set<TypePreuveExterne> {
  const types = new Set<TypePreuveExterne>();
  for (const id of faillesIds) {
    for (const t of PREUVES_PAR_FAILLE[id] ?? []) types.add(t);
  }
  return types;
}

/**
 * Failles qui rendent pertinente une preuve externe du type donné (inverse de
 * PREUVES_PAR_FAILLE) — sert à expliquer au client pourquoi une preuve
 * « Récupérée » a été apportée (lien preuve externe ↔ faille détectée).
 * Fonction pure, testée.
 */
export function faillesPourTypePreuve(type: TypePreuveExterne): string[] {
  const ids: string[] = [];
  for (const [failleId, types] of Object.entries(PREUVES_PAR_FAILLE)) {
    if (types.includes(type)) ids.push(failleId);
  }
  return ids;
}

const BAN_ENDPOINT = "https://api-adresse.data.gouv.fr/search/";
const OPENMETEO_ENDPOINT = "https://archive-api.open-meteo.com/v1/archive";
const RADARS_CSV_URL =
  "https://static.data.gouv.fr/resources/radars-automatiques/20181025-141231/radars.csv";
// Source travaux par défaut : plateforme OpendataSoft de la Sarthe (jeu de
// données "Chantiers routiers"), requêtable par date (date_debut/date_fin) et
// position (geofilter.distance). Surchargeable via TRAVAUX_OPENDATA_BASE.
const TRAVAUX_OPENDATA_BASE =
  process.env.TRAVAUX_OPENDATA_BASE ??
  "https://data.sarthe.fr/api/explore/v2.1/catalog/datasets/227200029_chantiers_routiers";

/**
 * Bases OpendataSoft des chantiers routiers interrogées. `TRAVAUX_OPENDATA_BASES`
 * (séparateur virgule) permet de surveiller plusieurs départements à la fois ;
 * à défaut, `TRAVAUX_OPENDATA_BASE` (défaut : Sarthe) est utilisé seul.
 */
function basesTravaux(): string[] {
  const multi = process.env.TRAVAUX_OPENDATA_BASES;
  if (multi?.trim()) {
    return multi.split(",").map((s) => s.trim()).filter(Boolean);
  }
  const single = TRAVAUX_OPENDATA_BASE.trim();
  return single ? [single] : [];
}
const TRAVAUX_RAYON_M = 20_000;
const RADARS_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const RADAR_DISTANCE_MAX_M = 1500;

/* ------------------------------- Géocodage ------------------------------- */

export type Coordonnees = {
  latitude: number;
  longitude: number;
  label: string;
};

export async function geocoderAdresse(
  adresse: string | null | undefined,
): Promise<Coordonnees | null> {
  if (!adresse || adresse.trim().length < 3) return null;
  try {
    const res = await fetch(
      `${BAN_ENDPOINT}?q=${encodeURIComponent(adresse)}&limit=1`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: number[] };
        properties?: { label?: string };
      }>;
    };
    const feature = data.features?.[0];
    const coords = feature?.geometry?.coordinates;
    if (!feature || !coords || coords.length < 2) return null;
    return {
      latitude: coords[1],
      longitude: coords[0],
      label: feature.properties?.label ?? adresse,
    };
  } catch {
    return null;
  }
}

/* --------------------------------- Météo --------------------------------- */

const WEATHER_CODES: Record<number, string> = {
  0: "Ciel dégagé",
  1: "Principalement clair",
  2: "Partiellement nuageux",
  3: "Couvert",
  45: "Brouillard",
  48: "Brouillard givrant",
  51: "Bruine légère",
  53: "Bruine modérée",
  55: "Bruine dense",
  56: "Bruine verglaçante légère",
  57: "Bruine verglaçante dense",
  61: "Pluie légère",
  63: "Pluie modérée",
  65: "Pluie forte",
  66: "Pluie verglaçante légère",
  67: "Pluie verglaçante forte",
  71: "Neige légère",
  73: "Neige modérée",
  75: "Neige forte",
  77: "Grains de neige",
  80: "Averses de pluie légères",
  81: "Averses de pluie modérées",
  82: "Averses de pluie violentes",
  85: "Averses de neige légères",
  86: "Averses de neige fortes",
  95: "Orages",
  96: "Orages avec grêle légère",
  99: "Orages avec grêle forte",
};

/**
 * Résume les conditions météo récupérées. Sans `heure`, résumé journalier
 * (min/max, précipitations, vent). Avec `heure` (0-23), résumé à l'heure près
 * (horaire Open-Meteo indexé sur l'heure locale du jour de l'infraction) —
 * condition défavorable au moment exact du PV : pluie sur la seule heure de
 * l'infraction alors que la journée était globalement clémente, ou le contraire.
 */
function resumerMeteo(data: unknown, heure?: number | null): string | null {
  const d = data as {
    daily?: {
      weathercode?: number[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_sum?: number[];
      rain_sum?: number[];
      snowfall_sum?: number[];
      windspeed_10m_max?: number[];
      windgusts_10m_max?: number[];
    };
    hourly?: {
      weathercode?: number[];
      temperature_2m?: number[];
      precipitation?: number[];
    };
  };
  if (!d) return null;

  if (
    heure != null &&
    Number.isInteger(heure) &&
    heure >= 0 &&
    heure <= 23 &&
    d.hourly?.weathercode?.length
  ) {
    const idx = heure;
    const code = d.hourly.weathercode[idx];
    if (code === undefined) return null;
    const temp = d.hourly.temperature_2m?.[idx];
    const precip = d.hourly.precipitation?.[idx] ?? 0;
    const desc = WEATHER_CODES[code] ?? `Code météo ${code}`;
    const parts = [`${heure}h`, desc];
    if (temp !== undefined) parts.push(`${Math.round(temp)}°C`);
    if (precip > 0) parts.push(`Précip: ${precip} mm`);
    return parts.join(" • ");
  }

  if (!d.daily?.weathercode?.length) return null;

  const idx = 0;
  const code = d.daily.weathercode?.[idx];
  const tempMax = d.daily.temperature_2m_max?.[idx];
  const tempMin = d.daily.temperature_2m_min?.[idx];
  const precip = d.daily.precipitation_sum?.[idx] ?? 0;
  const rain = d.daily.rain_sum?.[idx] ?? 0;
  const snow = d.daily.snowfall_sum?.[idx] ?? 0;
  const windMax = d.daily.windspeed_10m_max?.[idx];
  const gustMax = d.daily.windgusts_10m_max?.[idx];

  const desc = WEATHER_CODES[code ?? -1] ?? `Code météo ${code}`;
  const parts = [desc];
  if (tempMax !== undefined && tempMin !== undefined) {
    parts.push(`${Math.round(tempMin)}°/${Math.round(tempMax)}°C`);
  }
  if (precip > 0) parts.push(`Précip: ${precip} mm`);
  if (rain > 0) parts.push(`Pluie: ${rain} mm`);
  if (snow > 0) parts.push(`Neige: ${snow} mm`);
  if (windMax) parts.push(`Vent: ${Math.round(windMax)} km/h`);
  if (gustMax) parts.push(`Rafales: ${Math.round(gustMax)} km/h`);
  return parts.join(" • ");
}

export async function preuveMeteo(opts: {
  latitude: number;
  longitude: number;
  date: string;
  heure?: number | null;
}): Promise<string | null> {
  try {
    const hourly =
      opts.heure != null && opts.heure >= 0 && opts.heure <= 23
        ? "&hourly=weathercode,temperature_2m,precipitation"
        : "";
    const url = `${OPENMETEO_ENDPOINT}?latitude=${opts.latitude}&longitude=${opts.longitude}&start_date=${opts.date}&end_date=${opts.date}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,snowfall_sum,windspeed_10m_max,windgusts_10m_max${hourly}&timezone=Europe/Paris`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    return resumerMeteo(await res.json(), opts.heure ?? null);
  } catch {
    return null;
  }
}

/* ---------------------- Radars (liste officielle) ------------------------ */

type RadarCsvRow = {
  id: string;
  departement: string;
  latitude: string;
  longitude: string;
  type: string;
  route: string;
  emplacement: string;
  dateInstallation: string;
  direction?: string;
  equipement?: string;
  vitesseVehiculesLegers?: string;
};

let radarsCache: { at: number; rows: RadarCsvRow[] } | null = null;

async function chargerRadars(): Promise<RadarCsvRow[]> {
  const now = Date.now();
  if (radarsCache && now - radarsCache.at < RADARS_TTL_MS) {
    return radarsCache.rows;
  }
  try {
    const res = await fetch(RADARS_CSV_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return radarsCache?.rows ?? [];
    const txt = await res.text();
    const lignes = txt.split(/\r?\n/);
    if (lignes.length < 2) return [];
    const entete = lignes[0].split(",");
    const idx = (name: string) => entete.indexOf(name);
    const i = {
      id: idx("id"),
      dep: idx("departement"),
      lat: idx("latitude"),
      lon: idx("longitude"),
      type: idx("type"),
      route: idx("route"),
      emplacement: idx("emplacement"),
      dateInst: idx("date_installation"),
      direction: idx("direction"),
      equipement: idx("equipement"),
      vitesse: idx("vitesse_vehicules_legers_kmh"),
    };
    const rows: RadarCsvRow[] = [];
    for (let k = 1; k < lignes.length; k++) {
      const cols = lignes[k].split(",");
      const id = cols[i.id]?.trim();
      if (!id) continue;
      rows.push({
        id,
        departement: cols[i.dep]?.trim() ?? "",
        latitude: cols[i.lat]?.trim() ?? "",
        longitude: cols[i.lon]?.trim() ?? "",
        type: cols[i.type]?.trim() ?? "",
        route: cols[i.route]?.trim() ?? "",
        emplacement: cols[i.emplacement]?.trim() ?? "",
        dateInstallation: cols[i.dateInst]?.trim() ?? "",
        direction: cols[i.direction]?.trim() || undefined,
        equipement: cols[i.equipement]?.trim() || undefined,
        vitesseVehiculesLegers:
          cols[i.vitesse]?.trim() || undefined,
      });
    }
    radarsCache = { at: now, rows };
    return rows;
  } catch {
    return radarsCache?.rows ?? [];
  }
}

function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export type FicheRadar = {
  id: string;
  type: string;
  route: string;
  emplacement: string;
  departement: string;
  latitude: number;
  longitude: number;
  dateInstallation: string;
  /** Sens de circulation couvert (ex. « Tout sens ») quand la colonne existe. */
  direction?: string;
  /** Modèle de l'équipement (ex. « MESTA 210C ») quand la colonne existe. */
  equipement?: string;
  /** Limite réglementaire VL (km/h) quand la colonne existe. */
  vitesseVehiculesLegers?: number | null;
};

function toFiche(r: RadarCsvRow): FicheRadar {
  const vitesse = r.vitesseVehiculesLegers
    ? Number(r.vitesseVehiculesLegers)
    : NaN;
  return {
    id: r.id,
    type: r.type,
    route: r.route,
    emplacement: r.emplacement,
    departement: r.departement,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    dateInstallation: r.dateInstallation,
    direction: r.direction,
    equipement: r.equipement,
    vitesseVehiculesLegers: Number.isFinite(vitesse) ? vitesse : null,
  };
}

export async function rechercherRadar(opts: {
  radarId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<FicheRadar | null> {
  try {
    const rows = await chargerRadars();
    if (!rows.length) return null;
    if (opts.radarId) {
      const id = opts.radarId.trim();
      const exact = rows.find((r) => r.id === id);
      if (exact) return toFiche(exact);
    }
    if (opts.latitude != null && opts.longitude != null) {
      let best: RadarCsvRow | null = null;
      let bestDist = RADAR_DISTANCE_MAX_M;
      for (const r of rows) {
        const lat = Number(r.latitude);
        const lon = Number(r.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const d = distanceM(lat, lon, opts.latitude, opts.longitude);
        if (d < bestDist) {
          bestDist = d;
          best = r;
        }
      }
      if (best) return toFiche(best);
    }
    return null;
  } catch {
    return null;
  }
}

/* ----------------------------- Travaux (OpendataSoft) --------------------- */

export type ChantierTrouve = {
  localisation: string;
  nature: string;
  maitreOuvrage: string;
  dateDebut: string;
  dateFin: string;
  source: string;
};

export async function rechercherTravaux(opts: {
  latitude: number;
  longitude: number;
  date: string;
}): Promise<ChantierTrouve[]> {
  const bases = basesTravaux();
  if (!bases.length) return [];
  const vus = new Set<string>();
  const resultats: ChantierTrouve[] = [];
  for (const base of bases) {
    const sansSlash = base.replace(/\/+$/, "");
    try {
      const where = encodeURIComponent(
        `date_debut <= "${opts.date}" AND date_fin >= "${opts.date}"`,
      );
      const url = `${sansSlash}/records?where=${where}&geofilter.distance=${opts.latitude},${opts.longitude},${TRAVAUX_RAYON_M}&limit=10`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        results?: Array<Record<string, unknown>>;
      };
      let source = sansSlash;
      try {
        source = new URL(sansSlash).hostname;
      } catch {
        /* url malformée : on garde la base */
      }
      for (const r of data.results ?? []) {
        const localisation = String(
          r["loc_txt"] ?? r["libelle"] ?? r["localisation"] ?? "Chantier",
        ).trim();
        // Déduplication entre bases : un même chantier localisé dans plusieurs
        // jeux de données n'est jamais ajouté deux fois.
        if (!localisation || vus.has(localisation)) continue;
        vus.add(localisation);
        resultats.push({
          localisation,
          nature: String(r["nature_trvx"] ?? r["nature"] ?? r["objet"] ?? ""),
          maitreOuvrage: String(r["maitre_ouvrage"] ?? ""),
          dateDebut: String(r["date_debut"] ?? ""),
          dateFin: String(r["date_fin"] ?? ""),
          source,
        });
      }
    } catch {
      continue;
    }
  }
  return resultats;
}

/* ------------------- Pièces jointes de la contestation -------------------- */

export type PieceJointe = {
  nom: string;
  type: string;
  url: string;
};

/**
 * Liste les pièces jointes à mentionner dans la lettre et à transmettre avec la
 * contestation : la copie du PV / de la décision, puis chaque preuve réellement
 * récupérée (météo, fiche radar, travaux, pièces versées). Fonction pure —
 * aucun texte juridique inventé, seul un inventaire procédural. On ne liste que
 * les preuves présentes en base (garde-fou anti-hallucination) ; pour la météo,
 * on rappelle le relevé `conditions_meteo` si disponible.
 */
export function listePiecesJointes(opts: {
  type: InfractionType;
  conditionsMeteo?: string | null;
  numRef?: string | null;
  preuves: PieceJointe[];
}): string[] {
  const items: string[] = [];
  const ref = opts.numRef ? ` n° ${opts.numRef}` : "";
  items.push(
    opts.type === "SUSPENSION"
      ? `Copie de la décision de suspension${ref}`
      : `Copie de l'avis de contravention${ref}`,
  );
  for (const p of opts.preuves) {
    const nom = p.nom?.trim();
    if (!nom) continue;
    if (p.type === "METEO" && opts.conditionsMeteo) {
      items.push(`${nom} — ${opts.conditionsMeteo}`);
    } else {
      items.push(nom);
    }
  }
  return items;
}

/**
 * Lecteur des pièces jointes d'un dossier (PV + preuves stockées). Sert à
 * garnir la lettre PDF et le récépissé d'envoi. `dep` accepte prisma ou une
 * transaction Prisma.
 */
export async function lirePiecesJointesPourDossierId(
  dep: Pick<PrismaClient, "dossier">,
  dossierId: string,
): Promise<string[]> {
  const dossier = await dep.dossier.findUnique({
    where: { id: dossierId },
    include: { preuves: { orderBy: { createdAt: "asc" } } },
  });
  if (!dossier) return [];
  const data = (dossier.extractedData ?? {}) as Record<string, unknown>;
  return listePiecesJointes({
    type: dossier.type,
    conditionsMeteo: dossier.conditions_meteo,
    numRef: typeof data["num_pv"] === "string" ? (data["num_pv"] as string) : null,
    preuves: dossier.preuves.map((p) => ({ nom: p.nom, type: p.type, url: p.url })),
  });
}

/* ------------------- Orchestration (écriture des preuves) ----------------- */

/**
 * Récupère les preuves externes d'un dossier et les enregistre (Preuve +
 * conditions_meteo). Best-effort : n'ajoute jamais que des preuves réellement
 * obtenues. `dep` accepte prisma ou une transaction Prisma. `opts.types`
 * restreint la recherche aux types pertinents (voir PREUVES_PAR_FAILLE) ; sans
 * `types`, tous les types sont cherchés (relance manuelle du juriste).
 *
 * Anti-redondance : vérifie d'abord les preuves déjà présentes — une preuve
 * déjà identifiée n'est jamais ré-ajoutée (doublons impossibles). `verifiees`
 * liste les types déjà couverts (revérifiés sans ajout) ; `ajoutees` ne
 * contient QUE les preuves non encore identifiées.
 */
export async function recupererPreuvesPourDossierId(
  dep: Pick<PrismaClient, "dossier" | "preuve">,
  dossierId: string,
  opts?: { types?: Set<TypePreuveExterne> },
): Promise<{ ajoutees: string[]; verifiees: string[] }> {
  const ajoutees: string[] = [];
  const verifiees: string[] = [];
  const besoins = opts?.types;
  const besoin = (t: TypePreuveExterne) => !besoins || besoins.has(t);
  try {
    const dossier = await dep.dossier.findUnique({ where: { id: dossierId } });
    if (!dossier) return { ajoutees, verifiees };
    if (
      dossier.statut === "REJETE" ||
      dossier.statut === "RESOLU" ||
      dossier.statut === "ANNULE"
    ) {
      return { ajoutees, verifiees };
    }

    // Preuves déjà répertoriées : un type déjà couvert est seulement revérifié,
    // jamais re-créé (bouton « Vérifier les preuves » = non redondant).
    const existantes = await dep.preuve.findMany({
      where: { dossierId },
      select: { type: true, nom: true },
    });
    const dejaIdentifiee = (type: TypePreuveExterne) =>
      existantes.some((p) => p.type === type);
    const nomsTravauxExistants = new Set(
      existantes.filter((p) => p.type === "TRAVAUX").map((p) => p.nom),
    );

    const data = (dossier.extractedData ?? {}) as Record<string, unknown>;
    const date =
      typeof data["date"] === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(data["date"])
        ? (data["date"] as string)
        : null;
    // Heure de l'infraction (« 14h32 ») : permet une météo relevée à l'heure
    // près (preuve visibilité quand la condition défavorable s'est produite à
    // l'heure exacte du PV, même si la journée était globalement clémente).
    let heure: number | null = null;
    if (typeof data["heure"] === "string") {
      const m = (data["heure"] as string).match(/^(\d{1,2})h/);
      if (m) heure = Math.min(23, Number(m[1]));
    }
    let latitude =
      typeof data["latitude"] === "number" ? (data["latitude"] as number) : null;
    let longitude =
      typeof data["longitude"] === "number"
        ? (data["longitude"] as number)
        : null;

    const coordsUtiles =
      besoin("METEO") || besoin("TRAVAUX") || besoin("RADAR");
    if (
      coordsUtiles &&
      (latitude === null || longitude === null) &&
      (data["adresse"] || data["lieu"])
    ) {
      const adresse = String(data["adresse"] ?? data["lieu"] ?? "");
      const coords = await geocoderAdresse(adresse);
      if (coords) {
        latitude = coords.latitude;
        longitude = coords.longitude;
        await dep.dossier
          .update({
            where: { id: dossierId },
            data: {
              extractedData: {
                ...data,
                latitude,
                longitude,
                adresse_geocodee: coords.label,
              },
            },
          })
          .catch(() => {});
      }
    }

    if (date && latitude !== null && longitude !== null) {
      if (besoin("METEO")) {
        if (dejaIdentifiee("METEO")) {
          verifiees.push("météo déjà identifiée (revérifiée)");
        } else {
          const resume = await preuveMeteo({
            latitude,
            longitude,
            date,
            heure,
          });
          // La preuve météo ne caractérise la faille « visibilité » QUE si les
          // conditions récupérées sont réellement défavorables (pluie, neige,
          // brouillard, verglas, orage). Une journée ensoleillée ou neutre ne
          // justifie aucune preuve : elle est écartée, jamais versée ni citée.
          if (resume && meteoDefavorable(resume)) {
            await dep.preuve
              .create({
                data: {
                  dossierId,
                  nom: "Bulletin météo historique",
                  type: "METEO",
                  url: "",
                },
              })
              .catch(() => {});
            await dep.dossier
              .update({ where: { id: dossierId }, data: { conditions_meteo: resume } })
              .catch(() => {});
            ajoutees.push(`météo (${resume})`);
          } else if (resume) {
            verifiees.push(
              "météo vérifiée : conditions non défavorables ce jour-là (preuve non caractérisante pour la faille météo)",
            );
          }
        }
      }

      if (besoin("TRAVAUX")) {
        if (dejaIdentifiee("TRAVAUX")) {
          verifiees.push("travaux déjà identifiés (revérifiés)");
        } else {
          const chantiers = await rechercherTravaux({ latitude, longitude, date });
          const nouveaux = chantiers.filter(
            (c) => !nomsTravauxExistants.has(`Travaux — ${c.localisation}`),
          );
          for (const c of nouveaux.slice(0, 5)) {
            await dep.preuve
              .create({
                data: {
                  dossierId,
                  nom: `Travaux — ${c.localisation}`,
                  type: "TRAVAUX",
                  url: "",
                },
              })
              .catch(() => {});
          }
          if (nouveaux.length) {
            ajoutees.push(
              `travaux (${nouveaux.length} chantier${nouveaux.length > 1 ? "s" : ""} non identifié${nouveaux.length > 1 ? "s" : ""})`,
            );
          }
        }
      }
    }

    const radarId =
      typeof data["radarId"] === "string" && data["radarId"]
        ? (data["radarId"] as string)
        : null;
    if (
      besoin("RADAR") &&
      (radarId || (latitude !== null && longitude !== null))
    ) {
      if (dejaIdentifiee("RADAR")) {
        verifiees.push("radar déjà identifié (revérifié)");
      } else {
        const radar = await rechercherRadar({ radarId, latitude, longitude });
        if (radar) {
          await dep.preuve
            .create({
              data: {
                dossierId,
                nom: `Fiche radar — ${radar.equipement || radar.type}${radar.route ? ` (${radar.route})` : ""}`,
                type: "RADAR",
                url: "",
              },
            })
            .catch(() => {});
          ajoutees.push(`radar (${radar.type})`);
        }
      }
    }
  } catch {
    // best-effort : ne bloque jamais un flux.
  }
  return { ajoutees, verifiees };
}
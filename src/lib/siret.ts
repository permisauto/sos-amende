/**
 * Vérification d'un SIRET auprès de l'API publique « Recherche d'entreprises »
 * (state.api.gouv.fr — gratuite, sans clé, 7 req/s). Sert deux usages au
 * référé d'urgence (chantier 2) : corroborer le SIRET saisi par le client et
 * pré-remplir `{entreprise}` avec la dénomination officielle de l'établissement.
 *
 * Discipline (identique à `preuves-api.ts`) : **best-effort total**. La clé de
 * contrôle Luhn d'un SIRET n'est pas appliquée comme garde bloquant — testée
 * empiriquement sur l'API réelle (2026-10-10), elle échoue sur au moins un
 * SIRET valide de La Poste (`35600000066432`) ; l'API est donc la seule source
 * de vérité sur l'existence de l'établissement. Aucune donnée d'état civil
 * n'est jamais inventée : sans réponse de l'API, la fonction retourne `null`.
 */

export type InfoSiret = {
  siret: string;
  /** Dénomination officielle (nom commercial ou raison sociale). */
  denomination: string;
  /** Adresse de l'établissement (siège ou adresse renseignée). */
  adresse: string | null;
  /** État administratif : `A` = active, `F` = fermée. */
  etatAdministratif: string;
};

const ENDPOINT = "https://recherche-entreprises.api.gouv.fr/search";
const TIMEOUT_MS = 5_000;

/**
 * Normalise une saisie humaine en SIRET potentiels (14 chiffres). Retourne
 * `null` si le format est invalide — la clé de contrôle n'est **pas** vérifiée
 * localement (voir en-tête du module : l'API est le juge d'existence).
 * Fonction pure, testée.
 */
export function normaliserSiret(brut: unknown): string | null {
  if (typeof brut !== "string") return null;
  // Conserve uniquement les chiffres (la saisie humaine glisse souvent des
  // espaces tous les 3 chiffres : « 356 000 000 66432 »).
  const chiffres = brut.replace(/\D+/g, "");
  if (chiffres.length !== 14) return null;
  return chiffres;
}

/**
 * Provider de vérification : `mock` = réponse déterministe (dev / E2E, sans
 * appel réseau), autrement vide ou inconnu = appel réel de l'API publique.
 */
export function siretProvider(): "mock" | "reel" {
  return process.env.SIRET_PROVIDER === "mock" ? "mock" : "reel";
}

/**
 * Réponse du provider mock — déterministe, sans réseau. Un SIRET valide est
 * toujours « trouvé » (entreprise fictive) : le mock ne simule que le chemin
 * succès, les chemins d'erreur restent couverts par les tests unitaires du
 * parser réel.
 */
function reponseMock(siret: string): InfoSiret {
  return {
    siret,
    denomination: "SAS ENTREPRISE MOCK",
    adresse: "1 rue de la République 69001 LYON",
    etatAdministratif: "A",
  };
}

/** Structure minimale du champ `matching_etablissements` de l'API. */
type EtablissementApi = {
  siret?: string;
  adresse?: string | null;
  etat_administratif?: string | null;
};

/** Structure minimale d'un résultat de l'API. */
type ResultatApi = {
  nom_complet?: string | null;
  nom_raison_sociale?: string | null;
  siege?: EtablissementApi | null;
  matching_etablissements?: EtablissementApi[];
};

/**
 * Extrait `InfoSiret` d'une réponse d'API (ou `null` si absente/incomplète).
 * Exportée pour les tests — le parser est pur et testé sur fixture JSON,
 * sans réseau.
 */
export function parserReponseSiret(siret: string, brut: unknown): InfoSiret | null {
  if (typeof brut !== "object" || brut === null) return null;
  const data = brut as { results?: ResultatApi[] };
  const premier = data.results?.[0];
  if (!premier) return null;
  const etab = premier.matching_etablissements?.find((e) => e.siret === siret)
    ?? premier.matching_etablissements?.[0]
    ?? premier.siege
    ?? null;
  const denomination = (premier.nom_complet ?? premier.nom_raison_sociale ?? "").trim();
  if (!denomination) return null;
  return {
    siret: etab?.siret ?? siret,
    denomination,
    adresse: (etab?.adresse ?? "").trim() || null,
    etatAdministratif: (etab?.etat_administratif ?? "").trim() || "A",
  };
}

/**
 * Interroge l'API publique pour un SIRET normalisé (14 chiffres). Retourne
 * `null` en cas d'erreur réseau, de timeout, de format invalide ou
 * d'établissement introuvable — jamais d'exception propagée.
 */
export async function verifierSiret(siret: string): Promise<InfoSiret | null> {
  const normalise = normaliserSiret(siret);
  if (!normalise) return null;
  if (siretProvider() === "mock") return reponseMock(normalise);
  try {
    const res = await fetch(
      `${ENDPOINT}?q=${encodeURIComponent(normalise)}&per_page=1`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok) return null;
    return parserReponseSiret(normalise, await res.json());
  } catch {
    return null;
  }
}

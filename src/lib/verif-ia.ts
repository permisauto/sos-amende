import { z } from "zod";

/** Faille du catalogue telles que l'IA a le droit de les citer (ids seulement). */
export type CatalogueIa = {
  id: string;
  titreFaille: string;
  articleLoi: string;
  regle?: string | null;
  jurisprudence?: string[];
};

export type ReponseIa = {
  suggestions: Array<{
    id: string;
    pertinence: "forte" | "moyenne";
    justification: string;
    controle?: string;
  }>;
  signalements: Array<{ id: string; motif: string }>;
};

const schemaReponse = z.object({
  suggestions: z
    .array(
      z.object({
        id: z.string(),
        pertinence: z.enum(["forte", "moyenne"]),
        justification: z.string(),
        controle: z.string().optional(),
      }),
    )
    .default([]),
  signalements: z
    .array(z.object({ id: z.string(), motif: z.string() }))
    .default([]),
});

/**
 * Prompt de vérification cas d'espèce : faits du dossier + catalogue limité.
 * Garde-fous anti-hallucination écrit dans le prompt (ids du catalogue
 * uniquement, prémisses vérifiées par un fait, JSON de sortie imposé) —
 * doublés côté code par `parserReponseIa` (ids hors catalogue = rejet).
 */
export function construirePrompt(
  faits: Record<string, unknown>,
  catalogue: CatalogueIa[],
): string {
  return [
    "Tu assistes un juriste français qui vérifie les failles de contestation d'un procès-verbal (cas d'espèce).",
    "",
    "Réponds UNIQUEMENT par un objet JSON sans texte autour, de la forme :",
    '{"suggestions":[{"id":"...","pertinence":"forte|moyenne","justification":"...","controle":"..."}],"signalements":[{"id":"...","motif":"..."}]}',
    "",
    "Règles absolues :",
    "1. N'utilise que des id exacts du catalogue fourni — n'invente jamais d'article, de fondement ou d'id.",
    "2. Ne suggère une faille que si UN FAIT précis du dossier en vérifie objectivement les prémisses (délai, plaque, mention manquante, étalonnage, lieu, pièce versée, texte du PV…). À défaut : ne la suggère pas.",
    "3. justification : cite le fait du dossier qui fonde la suggestion (2 phrases maximum).",
    "4. controle : une action concrète et brève pour le juriste (optionnel).",
    "5. signalements : réservé à une faille du catalogue dont UN FAIT contredit la détection (faux positif probable).",
    "6. Si aucune faille ne correspond aux faits : {\"suggestions\":[],\"signalements\":[]}.",
    "",
    "=== FAITS DU DOSSIER ===",
    JSON.stringify(faits, null, 2),
    "",
    "=== CATALOGUE DES FAILLES (seuls ids autorisés) ===",
    JSON.stringify(catalogue, null, 2),
  ].join("\n");
}

/**
 * Parse + valide la réponse de l'IA. Toute id hors catalogue est filtrée
 * (comptée) — jamais écrite en base. `null` = réponse illisible (l'appelant
 * bascule sur la vérification par règles).
 */
export function parserReponseIa(
  brut: string,
  idsAutorises: string[],
): { reponse: ReponseIa; idsIgnores: number } | null {
  let texte = brut.trim();
  // Certains modèles entourent le JSON de ```json … ```.
  texte = texte.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(texte);
  } catch {
    return null;
  }
  const parsed = schemaReponse.safeParse(json);
  if (!parsed.success) return null;

  const autorises = new Set(idsAutorises);
  const vus = new Set<string>();
  let idsIgnores = 0;

  const suggestions: ReponseIa["suggestions"] = [];
  for (const s of parsed.data.suggestions) {
    const justification = s.justification.trim();
    if (!autorises.has(s.id) || justification.length < 10 || vus.has(s.id)) {
      if (!autorises.has(s.id)) idsIgnores++;
      continue;
    }
    vus.add(s.id);
    suggestions.push({
      id: s.id,
      pertinence: s.pertinence,
      justification,
      controle: s.controle?.trim() || undefined,
    });
  }

  const signalements: ReponseIa["signalements"] = [];
  for (const s of parsed.data.signalements) {
    const motif = s.motif.trim();
    if (!autorises.has(s.id) || motif.length < 10) {
      if (!autorises.has(s.id)) idsIgnores++;
      continue;
    }
    if (vus.has(s.id)) continue; // déjà suggérée : la suggestion prime
    vus.add(s.id);
    signalements.push({ id: s.id, motif });
  }

  return { reponse: { suggestions, signalements }, idsIgnores };
}

/**
 * Réponse simulée déterministe (dev/E2E, `VERIF_IA_PROVIDER=mock`) : suggère
 * l'intégralité du catalogue fourni avec une justification tracée « mock » —
 * permet de tester le pipeline (écriture, affichage, préservation des
 * décisions) sans appel réseau ni clé.
 */
export function reponseIaMock(catalogue: CatalogueIa[]): ReponseIa {
  return {
    suggestions: catalogue.map((c) => ({
      id: c.id,
      pertinence: "moyenne",
      justification: `Simulation (mock) : les faits du dossier appellent « ${c.titreFaille} » — aucune IA réelle en test.`,
      controle: "Vérification simulée — aucun appel réseau.",
    })),
    signalements: [],
  };
}

export type ResultatVerifIa =
  | { source: "ia" | "mock"; reponse: ReponseIa; idsIgnores: number }
  | { source: "indisponible"; motif: string };

/**
 * Vérification approfondie par IA (Gemini Flash, déjà utilisé pour l'OCR) :
 * jamais d'exception — en cas de souci on renvoie `indisponible` et
 * l'appelant poursuit avec la vérification par règles seule.
 *
 * Providers : `VERIF_IA_PROVIDER=mock` (simulé), `off` (coupé), sinon
 * `gemini` si `GEMINI_API_KEY` présente, sinon indisponible.
 */
export async function verifierAvecIa(
  faits: Record<string, unknown>,
  catalogue: CatalogueIa[],
): Promise<ResultatVerifIa> {
  const provider = (process.env.VERIF_IA_PROVIDER ?? "").toLowerCase();

  if (provider === "off") {
    return { source: "indisponible", motif: "analyse IA désactivée (VERIF_IA_PROVIDER=off)" };
  }
  if (provider === "mock") {
    return { source: "mock", reponse: reponseIaMock(catalogue), idsIgnores: 0 };
  }

  const cle = process.env.GEMINI_API_KEY;
  if (!cle) {
    return {
      source: "indisponible",
      motif: "IA indisponible (GEMINI_API_KEY absente) — vérification par règles seule",
    };
  }

  try {
    const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": cle,
        },
        cache: "no-store",
        body: JSON.stringify({
          contents: [
            { parts: [{ text: construirePrompt(faits, catalogue) }] },
          ],
          generationConfig: {
            response_mime_type: "application/json",
            temperature: 0.2,
          },
        }),
      },
    );
    if (!res.ok) {
      console.error("[verif-ia] generateContent HTTP", res.status);
      return {
        source: "indisponible",
        motif: `appel IA en échec (HTTP ${res.status}) — vérification par règles seule`,
      };
    }
    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const brut = (body.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!brut) {
      return {
        source: "indisponible",
        motif: "réponse IA vide — vérification par règles seule",
      };
    }
    const parse = parserReponseIa(brut, catalogue.map((c) => c.id));
    if (!parse) {
      console.error("[verif-ia] réponse illisible:", brut.slice(0, 300));
      return {
        source: "indisponible",
        motif: "réponse IA illisible — vérification par règles seule",
      };
    }
    return { source: "ia", reponse: parse.reponse, idsIgnores: parse.idsIgnores };
  } catch (e) {
    console.error(
      "[verif-ia] échec :",
      e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    );
    return {
      source: "indisponible",
      motif: "appel IA en échec — vérification par règles seule",
    };
  }
}

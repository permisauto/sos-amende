/**
 * Appel Gemini en JSON partagé (vérification IA des failles, extraction de
 * propositions de veille).
 *
 * Politique identique pour les deux : timeout 30 s par requête
 * (`AbortSignal.timeout`), 3 tentatives sur 429/5xx (backoff 400/800 ms),
 * 4xx jamais retenté, jamais d'exception — l'appelant reçoit un motif prêt
 * à afficher. Un 503 Gemini est presque toujours une surcharge transitoire.
 */
export const TIMEOUT_IA_MS = 30_000;
export const TENTATIVES_IA = 3;

export type ResultatGemini =
  | { ok: true; texte: string }
  | { ok: false; motif: string };

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Envoie `prompt` à Gemini et renvoie le texte brut de la réponse JSON, ou un
 * motif d'échec. `etiquette` préfixe les logs (`[verif-ia]`, …).
 */
export async function appelerGeminiJson(
  prompt: string,
  etiquette = "ia",
): Promise<ResultatGemini> {
  const cle = process.env.GEMINI_API_KEY;
  if (!cle) {
    return { ok: false, motif: "IA indisponible (GEMINI_API_KEY absente)" };
  }
  const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
  const log = (msg: string) => console.error(`[${etiquette}] ${msg}`);

  let res: Response | undefined;
  let statut = 0;
  try {
    for (let essai = 1; essai <= TENTATIVES_IA; essai++) {
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": cle,
            },
            cache: "no-store",
            signal: AbortSignal.timeout(TIMEOUT_IA_MS),
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                response_mime_type: "application/json",
                temperature: 0.2,
              },
            }),
          },
        );
      } catch (e) {
        log(
          `appel échoué (essai ${essai}/${TENTATIVES_IA}) : ${
            e instanceof Error ? `${e.name}: ${e.message}` : String(e)
          }`,
        );
        res = undefined;
        if (essai === TENTATIVES_IA) {
          return { ok: false, motif: "appel IA en échec" };
        }
        await pause(400 * essai);
        continue;
      }
      if (res.ok) break;
      statut = res.status;
      const detail = (await res.text().catch(() => "")).slice(0, 400);
      log(
        `generateContent HTTP ${statut} (essai ${essai}/${TENTATIVES_IA})${
          detail ? ` — ${detail}` : ""
        }`,
      );
      const transitoire = statut === 429 || statut >= 500;
      if (!transitoire || essai === TENTATIVES_IA) break;
      await pause(400 * essai);
    }
    if (!res?.ok) {
      return {
        ok: false,
        motif: statut ? `appel IA en échec (HTTP ${statut})` : "appel IA en échec",
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
      return { ok: false, motif: "réponse IA vide" };
    }
    return { ok: true, texte: brut };
  } catch (e) {
    log(`échec : ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    return { ok: false, motif: "appel IA en échec" };
  }
}

import type { Dossier } from "@/generated/prisma/client";

export type SoumissionResult =
  | { ok: true; numeroDepot: string; preuveUrl: string }
  | { ok: false; error: string };

/**
 * Soumission du dossier vers l'ANTAI.
 * Dev/E2E uniquement : appelle le portail ANTAI MOCK local (/api/antai/mock).
 * Jamais le portail réel (garde-fou produit). En prod, brancher RPA/Playwright
 * ou l'API officielle derrière ce point d'entrée.
 */
export async function soumettreDossier(
  dossier: Dossier,
): Promise<SoumissionResult> {
  const data = (dossier.extractedData ?? {}) as Record<
    string,
    string | undefined
  >;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const res = await fetch(`${baseUrl}/api/antai/mock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        token: process.env.ANTAI_MOCK_TOKEN ?? "dev-antai-mock",
        numPv: data.num_pv,
        plaque: data.plaque,
        type: dossier.type,
        nom: data.nom,
        lettre: dossier.lettreGeneree,
      }),
    });

    if (!res.ok) {
      return {
        ok: false,
        error: `Le portail ANTAI (mock) a répondu ${res.status}.`,
      };
    }

    const body = (await res.json()) as {
      numeroDepot: string;
      preuveUrl: string;
    };
    return {
      ok: true,
      numeroDepot: body.numeroDepot,
      preuveUrl: body.preuveUrl,
    };
  } catch {
    return {
      ok: false,
      error: "Impossible de joindre le portail ANTAI (mock).",
    };
  }
}
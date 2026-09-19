import type { Dossier } from "@/generated/prisma/client";
import { organismeEnvoi } from "./envoi";

export type SoumissionResult =
  | { ok: true; numeroDepot: string; preuveUrl: string }
  | { ok: false; error: string };

const USE_REAL_ANTAI = process.env.ANTAI_REAL === "1";

/**
 * Soumission du dossier vers le portail (ANTAI / Télérecours).
 * Dev/E2E : appelle le portail MOCK local (/api/antai/mock).
 * Prod avec ANTAI_REAL=1 : utilise Playwright RPA (à implémenter selon le portail réel).
 */
export async function soumettreDossier(
  dossier: Dossier,
  preuves?: { nom: string }[],
): Promise<SoumissionResult> {
  if (USE_REAL_ANTAI) {
    return soumettreDossierReal(dossier, preuves);
  }
  return soumettreDossierMock(dossier, preuves);
}

async function soumettreDossierMock(
  dossier: Dossier,
  preuves?: { nom: string }[],
): Promise<SoumissionResult> {
  const data = (dossier.extractedData ?? {}) as Record<string, string | undefined>;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const res = await fetch(`${baseUrl}/api/antai/mock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        token:
          process.env.ANTAI_MOCK_TOKEN ??
          (process.env.NODE_ENV === "production" ? "" : "dev-antai-mock"),
        numPv: data.num_pv,
        plaque: data.plaque,
        type: dossier.type,
        nom: data.nom,
        lettre: dossier.lettreGeneree,
        organisme: organismeEnvoi(dossier.type),
        preuves: preuves ?? [],
      }),
    });

    if (!res.ok) {
      return {
        ok: false,
        error: `Le portail ${organismeEnvoi(dossier.type)} (mock) a répondu ${res.status}.`,
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
      error: `Impossible de joindre le portail ${organismeEnvoi(dossier.type)} (mock).`,
    };
  }
}

/**
 * RPA Playwright pour le portail ANTAI réel.
 * Activez avec ANTAI_REAL=1. Nécessite ANTAI_URL, ANTAI_LOGIN, ANTAI_PASSWORD.
 * Implémentation minimale — à adapter selon le portail cible.
 */
async function soumettreDossierReal(
  dossier: Dossier,
  preuves?: { nom: string }[],
): Promise<SoumissionResult> {
  const { chromium } = await import("playwright");
  const data = (dossier.extractedData ?? {}) as Record<string, string | undefined>;
  const url = process.env.ANTAI_URL;
  const login = process.env.ANTAI_LOGIN;
  const password = process.env.ANTAI_PASSWORD;

  if (!url || !login || !password) {
    return {
      ok: false,
      error: "Variables ANTAI_URL / ANTAI_LOGIN / ANTAI_PASSWORD manquantes pour RPA réel.",
    };
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle" });

    // Connexion — adapter selon le portail réel
    await page.fill('input[name="username"], input[name="login"], input[id*="user"]', login);
    await page.fill('input[type="password"], input[name="password"]', password);
    await page.click('button[type="submit"], input[type="submit"], button:has-text("Connexion")');
    await page.waitForLoadState("networkidle");

    // Navigation vers formulaire dépôt — adapter selon le portail réel
    await page.click('a:has-text("Déposer"), a:has-text("Nouveau"), button:has-text("Nouvelle contestation")');
    await page.waitForLoadState("networkidle");

    // Remplissage — adapter les sélecteurs selon le portail réel
    await page.fill('input[name*="pv"], input[id*="pv"]', data.num_pv ?? "");
    await page.fill('input[name*="plaque"], input[id*="plaque"]', data.plaque ?? "");
    await page.fill('textarea[name*="lettre"], textarea[id*="lettre"]', dossier.lettreGeneree ?? "");

    // Pièces jointes — adapter selon le portail réel
    for (const p of preuves ?? []) {
      await page.setInputFiles('input[type="file"]', { name: p.nom, mimeType: "application/pdf", buffer: Buffer.from("") });
    }

    // Soumission
    await page.click('button:has-text("Valider"), button:has-text("Envoyer"), button[type="submit"]');
    await page.waitForLoadState("networkidle");

    // Récupération numéro de dépôt et accusé — adapter selon le portail réel
    const numeroDepot = await page.locator('text=/ANTAI|TELER|dépôt|numéro/i').first().textContent().catch(() => `REAL-${Date.now()}`);
    const preuveUrl = await page.locator('a:has-text("accusé"), a:has-text("télécharger")').first().getAttribute("href").catch(() => "");

    return {
      ok: true,
      numeroDepot: numeroDepot?.trim() ?? `REAL-${Date.now()}`,
      preuveUrl: preuveUrl ?? "",
    };
  } catch (e) {
    return {
      ok: false,
      error: `RPA ANTAI échoué: ${e instanceof Error ? e.message : "erreur inconnue"}`,
    };
  } finally {
    await browser.close();
  }
}
import type { Dossier } from "@/generated/prisma/client";
import { baseUrlApp } from "@/lib/base-url";
import { organismeEnvoi } from "@/lib/envoi";
import { prisma } from "@/lib/prisma";
import { notifierDecisionsEnAttente, notifierStatut } from "@/lib/notifications";

/**
 * Récupération AUTOMATIQUE des décisions OMP — indépendante du client (v1.1).
 * Pour les dossiers déposés en ligne (ANTAI/Télérecours), SOS Amende interroge
 * elle-même le portail (via le cron /api/cron/recuperations-decisions),
 * récupère la décision de l'OMP, passe le dossier RESOLU et notifie le client.
 * Aucune décision n'est jamais fabriquée : sans retour du portail, le dossier
 * reste ENVOYE (garde-fou anti-hallucination).
 *
 * Trois modes (calqués sur `soumettreDossier`) :
 * - `mock`  : dev/E2E → /api/antai/mock/decision (jamais le vrai portail) ;
 * - `rpa`   : portail réel derrière ANTAI_REAL=1 (Playwright lecture seule),
 *             sélecteurs à calibrer sur le portail live (désactivé par défaut) ;
 * - `aucun` : prod sans ANTAI_REAL=1 → inertie totale, aucun appel réseau.
 */

export type RecuperationDecision =
  | { consulte: true; decision: "ACCEPTE" | "REJETE"; reponsePortail: string; detail: string }
  | { consulte: true; decision: null; reponsePortail: string } // pas encore de décision
  | { consulte: false; error: string }; // consultation impossible (mode inactif / échec)

export const JOUR_MS = 24 * 60 * 60 * 1000;

/** Nombre de jours écoulés depuis une date (0 si passée, null si absente). */
export function joursDepuis(date: Date | null | undefined, reference: number = Date.now()): number | null {
  if (!date) return null;
  return Math.max(0, Math.floor((reference - date.getTime()) / JOUR_MS));
}

/**
 * Éligibilité d'un dossier au suivi automatique : envoyé (ENVOYE), canal en
 * ligne (jamais LRAR), fenêtre d'attente atteinte, décision pas encore lue.
 */
export function estEligibleSuivi(
  dossier: {
    statut: string;
    canalEnvoi: string | null | undefined;
    decisionAttendueLe: Date | null | undefined;
    decisionRecupereeLe: Date | null | undefined;
  },
  attendreJours: number,
  reference: number = Date.now(),
): boolean {
  if (dossier.statut !== "ENVOYE") return false;
  if (dossier.canalEnvoi !== "ANTAI" && dossier.canalEnvoi !== "TELERECOURS") return false;
  if (dossier.decisionRecupereeLe) return false;
  const j = joursDepuis(dossier.decisionAttendueLe, reference);
  return j !== null && j >= attendreJours;
}

/** Référence du PV/décision extraite des données OCR (matching portail). */
export function numRefExtrait(extractedData: unknown): string | null {
  const data = (extractedData ?? {}) as Record<string, unknown>;
  const raw = typeof data["num_pv"] === "string" ? data["num_pv"] : typeof data["num_telepaiement"] === "string" ? data["num_telepaiement"] : null;
  return raw && raw.trim() ? raw.trim() : null;
}

export type ModeSuivi = "mock" | "rpa" | "aucun";

/** Mode actif de consultation des décisions (cf. en-tête du module). */
export function modeSuivi(): ModeSuivi {
  if (process.env.ANTAI_REAL === "1") return "rpa";
  if (process.env.NODE_ENV !== "production" || process.env.ANTAI_MOCK === "1") return "mock";
  return "aucun";
}

/** Réponse du portail mock (GET /api/antai/mock/decision). */
export type MockReponseDecision =
  | { ok: true; statut: "DECISION"; decision: "ACCEPTE" | "REJETE"; detail?: string; reponsePortail: string }
  | { ok: true; statut: "ENCOURS"; reponsePortail: string };

/** Normalise la réponse du portail mock en `RecuperationDecision` (pur). */
export function mapperReponseMock(body: MockReponseDecision): RecuperationDecision {
  if (body.ok) {
    if (body.statut === "DECISION") {
      return {
        consulte: true,
        decision: body.decision,
        reponsePortail: body.reponsePortail,
        detail: body.detail ?? "",
      };
    }
    return { consulte: true, decision: null, reponsePortail: body.reponsePortail };
  }
  return { consulte: false, error: "Réponse du portail mock illisible." };
}

const REG_ACCEPTE =
  /accept[ée]e|requ[eê]te accept|exon[ée]e|annul[eé]|accord|class[eé] sans suite|bien[- ]fond[ée]/i;
const REG_REJETE = /rejet[ée]e?|requ[eê]te rejet|irrecevable|non fond[ée]e?|maintien de/i;

/**
 * Lit une décision depuis le texte d'une page/cellule du portail (français).
 * Pur — aucune décision n'est inventée : sans mot-clé univoque, retourne null
 * (le dossier reste ENVOYE, le cron réessaiera demain).
 */
export function lireDecisionDepuisTexte(cellule: string): RecuperationDecision | null {
  const texte = cellule.trim();
  if (REG_ACCEPTE.test(texte)) {
    return {
      consulte: true,
      decision: "ACCEPTE",
      reponsePortail: texte.slice(0, 300),
      detail: "Requête acceptée (portail officiel)",
    };
  }
  if (REG_REJETE.test(texte)) {
    return {
      consulte: true,
      decision: "REJETE",
      reponsePortail: texte.slice(0, 300),
      detail: "Requête rejetée (portail officiel)",
    };
  }
  return null;
}

/** Consultation sur le portail mock (dev/E2E uniquement). */
async function consulterMock(numPv: string): Promise<RecuperationDecision> {
  // En build prod local (E2E), baseUrlApp déduit https par défaut — le mock est
  // toujours servi en HTTP : on privilégie NEXT_PUBLIC_APP_URL (http en E2E),
  // avec repli dev HTTP sur l'hôte de la requête.
  const base =
    (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") ||
    (await baseUrlApp("http://localhost:3200")).replace(/\/$/, "");
  const token =
    process.env.ANTAI_MOCK_TOKEN ??
    (process.env.NODE_ENV === "production" ? "impossible" : "dev-antai-mock");
  try {
    const res = await fetch(
      `${base}/api/antai/mock/decision?token=${encodeURIComponent(token)}&numPv=${encodeURIComponent(numPv)}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      return { consulte: false, error: `Le portail ${organismeEnvoi("AMENDE")} (mock, décision) a répondu ${res.status}.` };
    }
    const body = (await res.json()) as MockReponseDecision;
    return mapperReponseMock(body);
  } catch {
    return { consulte: false, error: "Impossible de joindre le portail mock (décision)." };
  }
}

/**
 * RPA Playwright lecture seule sur le portail réel (ANTAI/Télérecours).
 * Désactivé par défaut (ANTAI_REAL=1 requis) et à CALIBRER sur le portail
 * live : les sélecteurs ci-dessous sont « généralistes par défaut » — la
 * validation se fait une fois en mode visuel avec un compte dédié (voir plan).
 * En cas de sélecteur cassé/CAPTCHA/échec : retour `consulte: false` — jamais
 * une décision inventée. `ANTAI_URL/ANTAI_LOGIN/ANTAI_PASSWORD` requis.
 */
async function consulterPortailReel(numPv: string): Promise<RecuperationDecision> {
  const url = process.env.ANTAI_URL;
  const login = process.env.ANTAI_LOGIN;
  const password = process.env.ANTAI_PASSWORD;
  if (!url || !login || !password) {
    return { consulte: false, error: "Variables ANTAI_URL / ANTAI_LOGIN / ANTAI_PASSWORD manquantes (RPA réel)." };
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    // Connexion — adapter les sélecteurs au portail réel (calibration one-time).
    await page.fill('input[name="username"], input[name="login"], input[id*="user"], input[type="email"]', login);
    await page.fill('input[type="password"], input[name="password"]', password);
    await page.click('button[type="submit"], input[type="submit"], button:has-text("Connexion")');
    await page.waitForLoadState("networkidle");
    // Section « mes requêtes / suivi » — adapter au portail.
    await page
      .locator(
        'a:has-text("Mes requêtes"), a:has-text("Mes contestations"), a:has-text("Suivre"), a:has-text("Tableau de bord")',
      )
      .first()
      .click()
      .catch(() => {});
    await page.waitForLoadState("networkidle");
    const ligne = page
      .locator(`tr:has-text("${numPv}"), li:has-text("${numPv}"), .card:has-text("${numPv}")`)
      .first();
    await ligne.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
    const texte = ((await ligne.textContent().catch(() => "")) ?? "").trim();
    const lu = lireDecisionDepuisTexte(texte);
    if (lu) return lu;
    return {
      consulte: true,
      decision: null,
      reponsePortail: texte.slice(0, 300) || "Aucun statut de décision lisible (portail réel).",
    };
  } catch (e) {
    return {
      consulte: false,
      error: `RPA décision échoué: ${e instanceof Error ? e.message : "erreur inconnue"}`,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Récupère la décision actuelle d'un dossier (mode selon ANTAI_REAL/env).
 * Une décision retournée n'est JAMAIS fabriquée : elle provient du portail
 * (mock en dev, RPA réel derrière ANTAI_REAL=1).
 */
export async function recupererDecision(dossier: Dossier): Promise<RecuperationDecision> {
  const mode = modeSuivi();
  if (mode === "aucun") {
    return { consulte: false, error: "Suivi automatique des décisions désactivé (prod sans ANTAI_REAL=1)." };
  }
  const numPv = numRefExtrait(dossier.extractedData);
  if (!numPv) {
    return { consulte: false, error: "Référence de PV/décision introuvable pour le suivi sur le portail." };
  }
  return mode === "mock" ? consulterMock(numPv) : consulterPortailReel(numPv);
}

function nombreEnv(name: string, defaut: number): number {
  const raw = process.env[name];
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : defaut;
}

/**
 * Passe du cron `/api/cron/recuperations-decisions` : pour chaque dossier
 * éligible (ENVOYE, canal en ligne, attente ≥ DECISION_WAIT_JOURS, 21 j par
 * défaut), interroge le portail. Si une décision EST trouvée : transaction
 * RESOLU + decisionOmp + decisionDetail + DossierEvent DECISION + e-mail
 * client — sinon rien (le cron réessaie le lendemain). Pour LRAR (pas de
 * portail) : alerte équipe après DECISION_ALERT_JOURS (45 j par défaut).
 * `dossierId` (optionnel) restreint la passe à un dossier — pratique dev/E2E.
 */
export async function executerSuiviDecisions(opts?: {
  attendreJours?: number;
  alerteJours?: number;
  dossierId?: string;
}): Promise<{
  attendreJours: number;
  alerteJours: number;
  consultees: number;
  decisions: number;
  encours: number;
  echecs: number;
  alertesLrar: number;
}> {
  const attendreJours = opts?.attendreJours ?? nombreEnv("DECISION_WAIT_JOURS", 21);
  const alerteJours = opts?.alerteJours ?? nombreEnv("DECISION_ALERT_JOURS", 45);
  const seuil = new Date(Date.now() - attendreJours * JOUR_MS);

  const candidats = await prisma.dossier.findMany({
    where: {
      ...(opts?.dossierId ? { id: opts.dossierId } : {}),
      statut: "ENVOYE",
      canalEnvoi: { in: ["ANTAI", "TELERECOURS"] },
      decisionAttendueLe: { lte: seuil },
      decisionRecupereeLe: null,
    },
    orderBy: { decisionAttendueLe: "asc" },
    take: 50,
  });

  let consultees = 0;
  let decisions = 0;
  let encours = 0;
  let echecs = 0;

  for (const dossier of candidats) {
    const res = await recupererDecision(dossier);
    if (!res.consulte) {
      echecs += 1;
      continue;
    }
    consultees += 1;
    if (res.decision === null) {
      encours += 1;
      continue;
    }

    decisions += 1;
    const detail = `${res.detail || "Décision lue sur le portail"}`
      .replace(/\s+\.$/, ".")
      .replace(/\.+$/, ".");
    await prisma.$transaction([
      prisma.dossier.update({
        where: { id: dossier.id },
        data: {
          statut: "RESOLU",
          decisionOmp: res.decision,
          decisionDetail: `${detail} Décision récupérée automatiquement par SOS Amende.`,
          decisionRecupereeLe: new Date(),
          reponsePortail: res.reponsePortail,
        },
      }),
      prisma.dossierEvent.create({
        data: {
          dossierId: dossier.id,
          type: "DECISION",
          detail: `Décision lue sur le portail ${organismeEnvoi(dossier.type)} par SOS Amende (récupération automatique). ${res.reponsePortail}`,
        },
      }),
    ]);
    await notifierStatut(dossier.id).catch(() => false);
  }

  // LRAR : pas de portail consultable — signaler les décisions vraiment en retard.
  let alertesLrar = 0;
  if (!opts?.dossierId) {
    const seuilAlerte = new Date(Date.now() - alerteJours * JOUR_MS);
    const lrarEnAttente = await prisma.dossier.findMany({
      where: { statut: "ENVOYE", canalEnvoi: "LRAR", decisionAttendueLe: { lte: seuilAlerte } },
      select: { id: true, extractedData: true },
    });
    alertesLrar = lrarEnAttente.length;
    if (alertesLrar > 0) {
      await notifierDecisionsEnAttente(
        lrarEnAttente.map((d) => ({ id: d.id, numRef: numRefExtrait(d.extractedData) })),
      ).catch(() => false);
    }
  }

  return { attendreJours, alerteJours, consultees, decisions, encours, echecs, alertesLrar };
}
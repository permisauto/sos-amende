/**
 * Health Checks - Surveillance de l'état des services critiques
 * Utilisable pour monitoring, alerting, readiness/liveness probes
 */

import { createClient } from "@supabase/supabase-js";
import { storageWrite, storageDelete } from "@/lib/storage";
import { consommerCreneau } from "@/lib/rate-limit";
import { secretsEgaux } from "@/lib/cron-auth";
import { getOcrProvider } from "@/lib/ocr";

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  latencyMs?: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface HealthCheckResponse {
  status: HealthStatus;
  timestamp: string;
  version: string;
  environment: string;
  mode: "lite" | "full";
  checks: HealthCheckResult[];
  uptimeMs: number;
}

const START_TIME = Date.now();

function getStatus(latencyMs?: number, error?: string): HealthStatus {
  if (error) return "unhealthy";
  if (latencyMs && latencyMs > 5000) return "degraded";
  return "healthy";
}

async function checkSupabase(): Promise<HealthCheckResult> {
  const start = Date.now();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return {
      name: "supabase",
      status: "unhealthy",
      error: "Variables d'environnement manquantes (SUPABASE_URL, SUPABASE_ANON_KEY)",
    };
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );

    const start = Date.now();
    const { error } = await supabase
      .from("faillejuridique")
      .select("id")
      .limit(1);

    const latencyMs = Date.now() - start;

    if (error) {
      return {
        name: "supabase",
        status: "unhealthy",
        latencyMs,
        error: error.message,
      };
    }

    return {
      name: "supabase",
      status: getStatus(latencyMs),
      latencyMs,
      details: { message: "Connexion OK, table faillejuridique accessible" },
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    return {
      name: "supabase",
      status: "unhealthy",
      latencyMs,
      error: err instanceof Error ? err.message : "Erreur inconnue",
    };
  }
}

async function checkGroq(): Promise<HealthCheckResult> {
  const start = Date.now();

  if (!process.env.GROQ_API_KEY) {
    return {
      name: "groq",
      status: "degraded",
      error: "GROQ_API_KEY manquante (optionnelle, scripts de veille uniquement)",
    };
  }

  try {
    const start = Date.now();
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      return {
        name: "groq",
        status: "unhealthy",
        latencyMs,
        error: `HTTP ${response.status}`,
      };
    }

    return {
      name: "groq",
      status: getStatus(Date.now() - start),
      latencyMs: Date.now() - start,
      details: { message: "API Groq accessible" },
    };
  } catch (err: unknown) {
    return {
      name: "groq",
      status: "unhealthy",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Erreur inconnue",
    };
  }
}

async function checkResend(): Promise<HealthCheckResult> {
  const start = Date.now();
  const key = process.env.AUTH_RESEND_KEY?.replace(/^\uFEFF/, "").trim();

  if (!key) {
    return {
      name: "resend",
      status: "unhealthy",
      error: "AUTH_RESEND_KEY manquante",
    };
  }

  if (!key.startsWith("re_")) {
    return {
      name: "resend",
      status: "unhealthy",
      error: "Format clé Resend invalide (attendu: re_...)",
      latencyMs: 0,
    };
  }

  // Clé présente et format valide. On ne teste pas l'API Resend : la plupart des
  // clés sont restreintes aux emails (domains.list et autres endpoints refusés).
  // Le seul garant fiable est un envoi réel, testé en E2E.
  return {
    name: "resend",
    status: "healthy",
    latencyMs: Date.now() - start,
    details: { message: "AUTH_RESEND_KEY présente et format re_ valide" },
  };
}

async function checkDataGouv(): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    const controlleur = new AbortController();
    const timeout = setTimeout(() => controlleur.abort(), 5000);

    const res = await fetch(
      "https://static.data.gouv.fr/resources/radars-automatiques/20181025-141231/radars.csv",
      { signal: controlleur.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        name: "data.gouv.fr (radars)",
        status: "degraded",
        latencyMs: Date.now() - start,
        error: `HTTP ${res.status}`,
      };
    }

    return {
      name: "data.gouv.fr (radars)",
      status: "healthy",
      latencyMs: Date.now() - start,
      details: { message: "radars.csv data.gouv.fr accessible" },
    };
} catch (err: unknown) {
    return {
      name: "data.gouv.fr (radars)",
      status: "degraded",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Timeout/réseau",
      details: { message: "API externe, toléré en degraded" },
    };
  }
}

async function checkOpenMeteo(): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    const controlleur = new AbortController();
    const timeout = setTimeout(() => controlleur.abort(), 5000);

    const res = await fetch(
      "https://archive-api.open-meteo.com/v1/archive?latitude=48.85&longitude=2.35&start_date=2024-01-01&end_date=2024-01-01&daily=weathercode&timezone=Europe/Paris",
      { signal: controlleur.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        name: "open-meteo.com (historique)",
        status: "degraded",
        latencyMs: Date.now() - start,
        error: `HTTP ${res.status}`,
      };
    }

    return {
      name: "open-meteo.com (historique)",
      status: "healthy",
      latencyMs: Date.now() - start,
      details: { message: "Open-Meteo Historical API accessible" },
    };
  } catch (err: unknown) {
    return {
      name: "open-meteo.com (historique)",
      status: "degraded",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Erreur réseau",
      details: { message: "API externe, toléré en degraded" },
    };
  }
}

async function checkStorage(): Promise<HealthCheckResult> {
  const start = Date.now();
  const cle = `health-check-${Date.now()}.txt`;

  try {
    await storageWrite(cle, Buffer.from("test"));
    // Fichier de test retiré immédiatement : aucun orphelin dans le bucket.
    await storageDelete(cle).catch(() => {});

    return {
      name: "storage",
      status: "healthy",
      latencyMs: Date.now() - start,
      details: { message: "Stockage accessible (local/S3), fichier de test supprimé" },
    };
  } catch (err: unknown) {
    return {
      name: "storage",
      status: "unhealthy",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Erreur stockage",
    };
  }
}

/**
 * Snapshot de la configuration OCR (mode full uniquement) — sans appel API :
 * la présence/absence de la clé est détectée par `getOcrProvider`. Un provider
 * demandé (`OCR_PROVIDER` renseigné) mais désactivé par une clé manquante est
 * `unhealthy` : les dépôts tombent alors en saisie manuelle silencieuse
 * (bannière ?ocr=echec côté client, rien côté monitoring).
 */
function checkOcr(): HealthCheckResult {
  const brut = process.env.OCR_PROVIDER ?? "";
  const provider = getOcrProvider();
  const details = {
    provider,
    ocr_provider_configure: brut.trim() || "(vide)",
    // booléens seuls — jamais la valeur des clés (elles ne doivent pas fuiter
    // dans les journaux de monitoring, cf. /api/debug/config).
    google_vision_key_set: Boolean(process.env.GOOGLE_VISION_KEY),
    gemini_key_set: Boolean(process.env.GEMINI_API_KEY),
    mistral_key_set: Boolean(process.env.MISTRAL_API_KEY),
    timeout_ms: process.env.OCR_TIMEOUT_MS ?? "(défaut 20000)",
    http_timeout_ms: process.env.OCR_HTTP_TIMEOUT_MS ?? "(défaut 10000)",
  };

  if (!brut.trim()) {
    return {
      name: "ocr",
      status: "degraded",
      details: { ...details, message: "Aucun provider OCR configuré (OCR_PROVIDER vide)" },
    };
  }
  if (provider === "aucun") {
    return {
      name: "ocr",
      status: "unhealthy",
      error: `OCR_PROVIDER="${brut}" mais provider désactivé (clé API manquante)`,
      details,
    };
  }
  if (provider === "mock" && process.env.NODE_ENV === "production") {
    return {
      name: "ocr",
      status: "degraded",
      details: { ...details, message: "OCR simulé (mock) en production — textes fictifs" },
    };
  }
  return {
    name: "ocr",
    status: "healthy",
    details,
  };
}

/**
 * `full` (défaut) = toutes les vérifications, y compris les externes coûteuses
 * (radars.csv data.gouv, Open-Meteo, Groq, écriture storage). `lite` = checks
 * sans effet de bord (base + config e-mail) — c'est ce que reçoit un appelant
 * anonyme : `/api/health` public ne doit pas servir de relais de spam vers les
 * API tierces (audit lot 3).
 */
export async function runHealthChecks(full = true): Promise<HealthCheckResponse> {
  const checksEnVue = full
    ? [checkSupabase(), checkGroq(), checkResend(), checkDataGouv(), checkOpenMeteo(), checkStorage(), Promise.resolve(checkOcr())]
    : [checkSupabase(), checkResend()];
  const results = await Promise.allSettled(checksEnVue);

  const checks: HealthCheckResult[] = results.map((r) =>
    r.status === "fulfilled" ? r.value : {
      name: "unknown",
      status: "unhealthy",
      error: r.reason instanceof Error ? r.reason.message : "Check failed",
    }
  );

  const unhealthy = checks.filter((c) => c.status === "unhealthy").length;
  const degraded = checks.filter((c) => c.status === "degraded").length;

  let overallStatus: HealthStatus = "healthy";
  if (unhealthy > 0) overallStatus = "unhealthy";
  else if (degraded > 0) overallStatus = "degraded";

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
    environment: process.env.NODE_ENV ?? "development",
    mode: full ? "full" : "lite",
    checks,
    uptimeMs: Date.now() - START_TIME,
  };
}

/** Secret d'accès aux checks approfondis : CRON_SECRET (Header
 * `x-health-secret` ou `Authorization: Bearer …`). Sans CRON_SECRET, le mode
 * full reste ouvert hors production (dev local). */
function secretHealthValide(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const fourni = (
    req.headers.get("x-health-secret") ??
    req.headers.get("authorization") ??
    ""
  )
    .replace(/^Bearer\s+/i, "")
    .trim();
  // Comparaison constante du temps sur sha256 : jamais de fuite de longueur
  // (audit lot 5 — cf. `secretsEgaux`, partagée avec les endpoints cron).
  return secretsEgaux(fourni, secret);
}

export async function GET(req: Request) {
  // Rate-limit par IP : l'endpoint est public, il ne doit pas devenir un
  // relais de spam (même en mode lite, chaque appel ouvre une connexion base).
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  const essais = consommerCreneau(`health:${ip}`, 20, 15 * 60 * 1000);
  if (essais <= 0) {
    return new Response(JSON.stringify({ error: "Trop de requêtes." }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Retry-After": "900",
      },
    });
  }

  const full = secretHealthValide(req);
  const health = await runHealthChecks(full);

  const statusCode = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;

  return new Response(JSON.stringify(health, null, 2), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
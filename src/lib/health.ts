/**
 * Health Checks - Surveillance de l'état des services critiques
 * Utilisable pour monitoring, alerting, readiness/liveness probes
 */

import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { storageWrite } from "@/lib/storage";

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
  checks: HealthCheckResult[];
  uptimeMs: number;
}

const START_TIME = Date.now();
const APP_VERSION = process.env.npm_package_version ?? "0.1.0";

function getStatus(latencyMs?: number, error?: string): HealthStatus {
  if (error) return "unhealthy";
  if (latencyMs && latencyMs > 5000) return "degraded";
  return "healthy";
}

async function checkSupabase(): Promise<HealthCheckResult> {
  const start = Date.now();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

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
  const apiKey = process.env.GROQ_API_KEY;

  if (!process.env.GROQ_API_KEY) {
    return {
      name: "groq",
      status: "unhealthy",
      error: "GROQ_API_KEY manquante",
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

  if (!process.env.RESEND_API_KEY) {
    return {
      name: "resend",
      status: "unhealthy",
      error: "RESEND_API_KEY manquante",
    };
  }

  if (!process.env.RESEND_API_KEY?.startsWith("re_")) {
    return {
      name: "resend",
      status: "degraded",
      error: "Format clé Resend invalide (attendu: re_...)",
      latencyMs: 0,
    };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY!);
    const start = Date.now();

    // Test minimal : liste des domaines (léger)
    const { data, error } = await resend.domains.list();

    const latencyMs = Date.now() - start;

    if (error) {
      return {
        name: "resend",
        status: "unhealthy",
        latencyMs,
        error: error.message,
      };
    }

    return {
      name: "resend",
      status: getStatus(latencyMs),
      latencyMs,
      details: { message: "API Resend accessible" },
    };
  } catch (err: unknown) {
    // En dev sans clé valide, on retourne degraded au lieu de unhealthy
    const latencyMs = Date.now() - start;
    return {
      name: "resend",
      status: process.env.NODE_ENV === "production" ? "unhealthy" : "degraded",
      latencyMs,
      error: err instanceof Error ? err.message : "Erreur inconnue",
      details: { message: "Test email non effectué (dev)" },
    };
  }
}

async function checkDataGouv(): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    const url = "https://data.gouv.fr/api/1/datasets/cinemometres-homologues/records?rows=1";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      "https://data.gouv.fr/api/1/datasets/cinemometres-homologues/records?rows=1",
      { signal: new AbortSignal() } // AbortController non serialisable, on utilise timeout manuel
    );

    const latencyMs = Date.now() - start;

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
      details: { message: "API data.gouv.fr accessible" },
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
    const url = "https://archive-api.open-meteo.com/v1/archive?latitude=48.85&longitude=2.35&start_date=2024-01-01&end_date=2024-01-01&daily=weathercode&timezone=Europe/Paris";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      "https://archive-api.open-meteo.com/v1/archive?latitude=48.85&longitude=2.35&start_date=2024-01-01&end_date=2024-01-01&daily=weathercode&timezone=Europe/Paris",
      { signal: AbortSignal.timeout(5000) }
    );

    const latencyMs = Date.now() - start;

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

  try {
    const { storageWrite } = await import("@/lib/storage");
    await storageWrite(`health-check-${Date.now()}.txt`, Buffer.from("test"));

    return {
      name: "storage",
      status: "healthy",
      latencyMs: Date.now() - start,
      details: { message: "Stockage accessible (local/S3)" },
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

export async function runHealthChecks(): Promise<HealthCheckResponse> {
  const results = await Promise.allSettled([
    checkSupabase(),
    checkGroq(),
    checkResend(),
    checkDataGouv(),
    checkOpenMeteo(),
    checkStorage(),
  ]);

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
    checks,
    uptimeMs: Date.now() - START_TIME,
  };
}

export async function GET() {
  const health = await runHealthChecks();

  const statusCode = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;

  return new Response(JSON.stringify(health, null, 2), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
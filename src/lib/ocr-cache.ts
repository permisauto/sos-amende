import { createHash } from "crypto";
import type { OcrResult } from "./ocr";

/**
 * Cache FinOps par empreinte SHA-256 du document téléversé : un même fichier
 * ré-uploadé récemment est servi sans rappeler l'OCR (0 €, 0 latence).
 *
 * En mémoire (Map) — sans migration, sans Redis, sans dépendance de stockage.
 * Limites assumées : non partagé entre instances serverless et vidé au cold
 * start ; il capture néanmoins les doublons intra-session et les retries. TTL
 * configurable via `OCR_CACHE_TTL_SECONDS` (défaut 24 h).
 */

const TTL_PAR_DEFAUT = 86400; // secondes

function ttlCacheSecondes(): number {
  const n = Number.parseInt(process.env.OCR_CACHE_TTL_SECONDS ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : TTL_PAR_DEFAUT;
}

type EntreeCache = { resultat: OcrResult; expireAt: number };

const cache = new Map<string, EntreeCache>();

/** Empreinte SHA-256 hex d'un buffer (contenu du fichier, jamais de PII). */
export function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Résultat OCR en cache et non expiré, sinon `null`. */
export function lireCacheOcr(hash: string): OcrResult | null {
  const e = cache.get(hash);
  if (!e) return null;
  if (Date.now() > e.expireAt) {
    cache.delete(hash);
    return null;
  }
  return e.resultat;
}

/** Stocke le résultat OCR sous son empreinte (TTL renouvelé). */
export function ecrireCacheOcr(hash: string, resultat: OcrResult): void {
  cache.set(hash, { resultat, expireAt: Date.now() + ttlCacheSecondes() * 1000 });
}

/** Vide le cache (tests uniquement). */
export function viderCacheOcr(): void {
  cache.clear();
}

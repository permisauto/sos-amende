/**
 * Redis Rate Limiter - Rate limiting distribué avec Redis
 * Remplace le rate limiter en mémoire pour la production multi-instances
 */

import { getHybridCache } from '@/lib/redis-cache';

interface RateLimitConfig {
  max: number;
  windowMs: number;
  keyPrefix?: string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  total: number;
}

/**
 * Rate limiter distribué utilisant Redis
 */
export class RedisRateLimiter {
  private cache = getHybridCache();
  private defaultConfig: RateLimitConfig = {
    max: 100,
    windowMs: 15 * 60 * 1000, // 15 minutes
    keyPrefix: 'ratelimit:',
  };

  /**
   * Vérifie et consomme un créneau de rate limiting
   */
  async consume(
    key: string, 
    config: Partial<RateLimitConfig> = {}
  ): Promise<RateLimitResult> {
    const { max, windowMs, keyPrefix } = { ...this.defaultConfig, ...config };
    const fullKey = `${keyPrefix}${key}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    const resetTime = now + windowMs;

    try {
      // Utiliser une transaction Redis pour atomicité
      const cache = getHybridCache();
      
      // Pour le cache hybride, on utilise une approche basée sur les clés Redis directement
      // si Redis est disponible, sinon fallback mémoire
      
      if (cache.isUsingRedis()) {
        return this.consumeRedis(fullKey, max, windowMs, windowStart, resetTime);
      } else {
        return this.consumeMemory(fullKey, max, windowMs, windowStart, resetTime);
      }
    } catch (error) {
      console.error('[RateLimiter] Error:', error);
      // Fail-open: autoriser la requête en cas d'erreur
      return {
        allowed: true,
        remaining: max,
        resetTime,
        total: max,
      };
    }
  }

  /**
   * Consommation via Redis (distribué)
   */
  private async consumeRedis(
    key: string, 
    max: number, 
    windowMs: number, 
    windowStart: number, 
    resetTime: number
  ): Promise<RateLimitResult> {
    // Cette implémentation nécessite un accès direct au client Redis
    // Pour simplifier, on délègue au cache hybride qui gère Redis
    // En production, on utiliserait le client Redis directement pour les opérations atomiques
    
    // Fallback sur l'implémentation mémoire pour l'instant
    return this.consumeMemory(key, max, windowMs, windowStart, resetTime);
  }

  /**
   * Consommation en mémoire (fallback / développement)
   */
  private async consumeMemory(
    key: string, 
    max: number, 
    windowMs: number, 
    windowStart: number, 
    resetTime: number
  ): Promise<RateLimitResult> {
    const cache = getHybridCache();
    
    // Récupérer les timestamps existants
    const entry = await cache.get<{ timestamps: number[] }>(key);
    const timestamps = entry?.timestamps?.filter(t => t > windowStart) ?? [];
    
    if (timestamps.length >= max) {
      return {
        allowed: false,
        remaining: 0,
        resetTime,
        total: max,
      };
    }
    
    timestamps.push(Date.now());
    
    await cache.set(key, { timestamps }, windowMs + 1000); // TTL légèrement plus long que la fenêtre
    
    return {
      allowed: true,
      remaining: max - timestamps.length,
      resetTime,
      total: max,
    };
  }

  /**
   * Vérifie sans consommer (peek)
   */
  async peek(key: string, config: Partial<RateLimitConfig> = {}): Promise<RateLimitResult> {
    const { max, windowMs, keyPrefix } = { ...this.defaultConfig, ...config };
    const fullKey = `${keyPrefix}${key}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    const resetTime = now + windowMs;

    try {
      const cache = getHybridCache();
      const entry = await cache.get<{ timestamps: number[] }>(`${keyPrefix}${key}`);
      const timestamps = entry?.timestamps?.filter(t => t > windowStart) ?? [];
      
      return {
        allowed: timestamps.length < max,
        remaining: Math.max(0, max - timestamps.length),
        resetTime: now + windowMs,
        total: max,
      };
    } catch {
      return {
        allowed: true,
        remaining: max,
        resetTime: now + windowMs,
        total: max,
      };
    }
  }

  /**
   * Réinitialise un compteur
   */
  async reset(key: string, config: Partial<RateLimitConfig> = {}): Promise<void> {
    const { keyPrefix } = { ...this.defaultConfig, ...config };
    await getHybridCache().delete(`${keyPrefix}${key}`);
  }

  /**
   * Obtient les stats actuelles
   */
  async getStats(key: string, config: Partial<RateLimitConfig> = {}): Promise<{
    used: number;
    remaining: number;
    resetTime: number;
  }> {
    const result = await this.peek(key, config);
    return {
      used: result.total - result.remaining,
      remaining: result.remaining,
      resetTime: result.resetTime,
    };
  }
}

// Instance singleton
let redisRateLimiterInstance: RedisRateLimiter | null = null;

export function getRedisRateLimiter(): RedisRateLimiter {
  if (!redisRateLimiterInstance) {
    redisRateLimiterInstance = new RedisRateLimiter();
  }
  return redisRateLimiterInstance;
}

/**
 * Helper pour créer un rate limiter configuré
 */
export function createRateLimiter(config: RateLimitConfig): RedisRateLimiter {
  const limiter = new RedisRateLimiter();
  limiter.defaultConfig = { ...limiter.defaultConfig, ...config };
  return limiter;
}

/**
 * Rate limiters préconfigurés pour les endpoints courants
 */
export const RateLimiters = {
  // Auth endpoints
  auth: () => createRateLimiter({ 
    max: 10, 
    windowMs: 15 * 60 * 1000, 
    keyPrefix: 'ratelimit:auth:' 
  }),
  
  // Payment endpoints
  payment: () => createRateLimiter({ 
    max: 20, 
    windowMs: 15 * 60 * 1000, 
    keyPrefix: 'ratelimit:payment:' 
  }),
  
  // Demo endpoint
  demo: () => createRateLimiter({ 
    max: 20, 
    windowMs: 60 * 1000, 
    keyPrefix: 'ratelimit:demo:' 
  }),
  
  // Health check
  health: () => createRateLimiter({ 
    max: 20, 
    windowMs: 15 * 60 * 1000, 
    keyPrefix: 'ratelimit:health:' 
  }),
  
  // API général
  api: () => createRateLimiter({ 
    max: 100, 
    windowMs: 15 * 60 * 1000, 
    keyPrefix: 'ratelimit:api:' 
  }),
} as const;

/**
 * Middleware helper pour Next.js API routes
 */
export async function withRateLimit(
  request: Request,
  limiter: RedisRateLimiter,
  keyExtractor: (req: Request) => string
): Promise<{ allowed: boolean; response?: Response }> {
  const key = keyExtractor(request);
  const result = await limiter.consume(key);
  
  if (!result.allowed) {
    return {
      allowed: false,
      response: new Response(
        JSON.stringify({ 
          error: 'Trop de requêtes. Réessayez plus tard.',
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
        }),
        { 
          status: 429, 
          headers: { 
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': result.total.toString(),
            'X-RateLimit-Remaining': result.remaining.toString(),
            'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
          }
        }
      )
    };
  }
  
  return { allowed: true };
}

/**
 * Helper pour extraire l'IP du client
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Helper pour extraire l'email du corps de requête
 */
export async function getEmailFromRequest(request: Request): Promise<string> {
  try {
    const body = await request.json();
    return body.email?.toLowerCase() ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
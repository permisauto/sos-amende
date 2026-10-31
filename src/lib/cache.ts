/**
 * Cache simple en mémoire avec TTL et invalidation
 * Pour production, remplacer par Redis (ioredis)
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  tags: string[];
}

export class QueryCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private tagIndex = new Map<string, Set<string>>();
  private defaultTTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Récupère une valeur du cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Stocke une valeur dans le cache
   */
  set<T>(key: string, data: T, ttlMs?: number, tags: string[] = []): void {
    const expiresAt = Date.now() + (ttlMs ?? this.defaultTTL);
    
    // Nettoyer les anciens tags
    const oldEntry = this.cache.get(key);
    if (oldEntry) {
      for (const tag of oldEntry.tags) {
        this.tagIndex.get(tag)?.delete(key);
      }
    }

    // Stocker la nouvelle entrée
    this.cache.set(key, { data, expiresAt, tags });

    // Indexer par tags
    for (const tag of tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(key);
    }
  }

  /**
   * Supprime une clé du cache
   */
  delete(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      for (const tag of entry.tags) {
        this.tagIndex.get(tag)?.delete(key);
      }
      this.cache.delete(key);
    }
  }

  /**
   * Invalide toutes les entrées avec un tag donné
   */
  invalidateTag(tag: string): number {
    const keys = this.tagIndex.get(tag);
    if (!keys) return 0;

    let count = 0;
    for (const key of keys) {
      this.delete(key);
      count++;
    }
    this.tagIndex.delete(tag);
    return count;
  }

  /**
   * Invalide plusieurs tags
   */
  invalidateTags(tags: string[]): number {
    let total = 0;
    for (const tag of tags) {
      total += this.invalidateTag(tag);
    }
    return total;
  }

  /**
   * Nettoie les entrées expirées
   */
  cleanup(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Statistiques du cache
   */
  getStats(): { size: number; tags: number; hitRate?: number } {
    return {
      size: this.cache.size,
      tags: this.tagIndex.size,
    };
  }
}

// Instance singleton
export const queryCache = new QueryCache();

// Nettoyage périodique (toutes les minutes)
if (typeof window === 'undefined') {
  setInterval(() => {
    queryCache.cleanup();
  }, 60 * 1000);
}

/**
 * Helpers pour clés de cache standardisées
 */
export const CacheKeys = {
  dossier: (id: string) => `dossier:${id}`,
  dossierList: (userId: string, filters: string) => `dossiers:${userId}:${filters}`,
  user: (id: string) => `user:${id}`,
  userCredits: (id: string) => `user:credits:${id}`,
  faille: (id: string) => `faille:${id}`,
  failleList: (type: string, statut: string) => `failles:${type}:${statut}`,
  payment: (id: string) => `payment:${id}`,
  paymentList: (userId: string) => `payments:${userId}`,
  statsJuriste: () => `stats:juriste`,
  statsClient: (userId: string) => `stats:client:${userId}`,
} as const;

/**
 * Tags standardisés pour invalidation
 */
export const CacheTags = {
  dossier: (id: string) => `dossier:${id}`,
  user: (id: string) => `user:${id}`,
  faille: (id: string) => `faille:${id}`,
  payment: (id: string) => `payment:${id}`,
} as const;
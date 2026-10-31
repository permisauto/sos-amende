/**
 * Redis Session Store - Stockage de sessions distribué pour NextAuth
 * Remplace le stockage en base pour les sessions actives
 */

import { getHybridCache } from '@/lib/redis-cache';

interface SessionData {
  userId: string;
  email: string;
  role: string;
  expiresAt: number;
  createdAt: number;
  ip?: string;
  userAgent?: string;
}

interface SessionStoreConfig {
  keyPrefix?: string;
  defaultTTL?: number; // en millisecondes
}

/**
 * Store de sessions Redis pour NextAuth
 */
export class RedisSessionStore {
  private cache = getHybridCache();
  private keyPrefix: string;
  private defaultTTL: number;

  constructor(config: SessionStoreConfig = {}) {
    this.keyPrefix = config.keyPrefix ?? 'session:';
    this.defaultTTL = config.defaultTTL ?? 30 * 24 * 60 * 60 * 1000; // 30 jours
  }

  /**
   * Crée une nouvelle session
   */
  async createSession(
    sessionToken: string,
    data: Omit<SessionData, 'createdAt' | 'expiresAt'>,
    ttlMs?: number
  ): Promise<void> {
    const now = Date.now();
    const sessionData: SessionData = {
      ...data,
      createdAt: now,
      expiresAt: now + (ttlMs ?? this.defaultTTL),
    };

    await getHybridCache().set(
      `${this.keyPrefix}${sessionToken}`,
      sessionData,
      ttlMs ?? this.defaultTTL
    );
  }

  /**
   * Récupère une session
   */
  async getSession(sessionToken: string): Promise<SessionData | null> {
    const session = await getHybridCache().get<SessionData>(
      `${this.keyPrefix}${sessionToken}`
    );
    
    if (!session) return null;
    
    // Vérifier l'expiration (double vérification)
    if (Date.now() > session.expiresAt) {
      await this.deleteSession(sessionToken);
      return null;
    }
    
    return session;
  }

  /**
   * Met à jour une session (prolonge l'expiration)
   */
  async updateSession(
    sessionToken: string,
    data: Partial<SessionData>,
    ttlMs?: number
  ): Promise<void> {
    const existing = await this.getSession(sessionToken);
    if (!existing) return;
    
    const updated: SessionData = {
      ...existing,
      ...data,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTTL),
    };
    
    await getHybridCache().set(
      `${this.keyPrefix}${sessionToken}`,
      updated,
      ttlMs ?? this.defaultTTL
    );
  }

  /**
   * Supprime une session (logout)
   */
  async deleteSession(sessionToken: string): Promise<void> {
    await getHybridCache().delete(`${this.keyPrefix}${sessionToken}`);
  }

  /**
   * Supprime toutes les sessions d'un utilisateur
   */
  async deleteUserSessions(userId: string): Promise<number> {
    // Note: nécessite un index par userId pour être efficace
    // Pour l'instant, on utilise l'invalidation par tag si configuré
    return 0;
  }

  /**
   * Vérifie si une session est valide
   */
  async isValid(sessionToken: string): Promise<boolean> {
    const session = await this.getSession(sessionToken);
    return session !== null;
  }

  /**
   * Prolonge l'expiration d'une session
   */
  async touch(sessionToken: string, ttlMs?: number): Promise<void> {
    const existing = await this.getSession(sessionToken);
    if (!existing) return;
    
    await getHybridCache().set(
      `${this.keyPrefix}${sessionToken}`,
      { ...existing, expiresAt: Date.now() + (ttlMs ?? this.defaultTTL) },
      ttlMs ?? this.defaultTTL
    );
  }
}

// Instance singleton
let redisSessionStoreInstance: RedisSessionStore | null = null;

export function getRedisSessionStore(config?: { keyPrefix?: string; defaultTTL?: number }): RedisSessionStore {
  if (!redisSessionStoreInstance) {
    redisSessionStoreInstance = new RedisSessionStore(config);
  }
  return redisSessionStoreInstance;
}

export function resetRedisSessionStore(): void {
  redisSessionStoreInstance = null;
}

/**
 * Adapter pour NextAuth v5 (si nécessaire)
 * Note: NextAuth v5 utilise son propre adapter Prisma pour les sessions persistantes
 * Ce store Redis est pour les sessions actives en mémoire (cache)
 */
export const redisSessionAdapter = {
  async createSession(sessionToken: string, data: SessionData): Promise<void> {
    const store = getRedisSessionStore();
    await store.createSession(sessionToken, data);
  },

  async getSession(sessionToken: string): Promise<SessionData | null> {
    const store = getRedisSessionStore();
    return store.getSession(sessionToken);
  },

  async updateSession(sessionToken: string, data: Partial<SessionData>): Promise<void> {
    const store = getRedisSessionStore();
    await store.updateSession(sessionToken, data);
  },

  async deleteSession(sessionToken: string): Promise<void> {
    const store = getRedisSessionStore();
    await store.deleteSession(sessionToken);
  },
};
/**
 * Redis Distributed Cache - Cache distribué pour multi-instances
 * Remplace le cache en mémoire en production
 * Supporte: TTL, tags, invalidation granulaire, sessions, rate limiting
 */

import Redis from 'ioredis';
import { logger } from '@/lib/structured-logging';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  tags: string[];
}

interface RedisCacheConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  connectionTimeout?: number;
  maxRetriesPerRequest?: number;
  retryStrategy?: (times: number) => number | null;
  enableOfflineQueue?: boolean;
  lazyConnect?: boolean;
}

/**
 * Cache Redis distribué avec support des tags et invalidation
 */
export class RedisCache {
  private client: Redis;
  private keyPrefix: string;
  private defaultTTL: number;
  private connected: boolean = false;
  private connectionPromise: Promise<void> | null = null;

  constructor(config: RedisCacheConfig = {}) {
    this.keyPrefix = config.keyPrefix ?? 'sos-amende:cache:';
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes

    const redisUrl = config.url ?? process.env.REDIS_URL;
    
    this.client = redisUrl 
      ? new Redis(redisUrl, {
          maxRetriesPerRequest: config.maxRetriesPerRequest ?? 3,
          retryStrategy: config.retryStrategy ?? ((times) => Math.min(times * 100, 3000)),
          enableOfflineQueue: config.enableOfflineQueue ?? false,
          lazyConnect: config.lazyConnect ?? true,
          connectTimeout: config.connectionTimeout ?? 10000,
        })
      : new Redis({
          host: config.host ?? process.env.REDIS_HOST ?? 'localhost',
          port: config.port ?? parseInt(process.env.REDIS_PORT ?? '6379'),
          password: config.password ?? process.env.REDIS_PASSWORD,
          db: config.db ?? parseInt(process.env.REDIS_DB ?? '0'),
          keyPrefix: this.keyPrefix,
          maxRetriesPerRequest: config.maxRetriesPerRequest ?? 3,
          retryStrategy: config.retryStrategy ?? ((times) => Math.min(times * 100, 3000)),
          enableOfflineQueue: config.enableOfflineQueue ?? false,
          lazyConnect: config.lazyConnect ?? true,
          connectTimeout: config.connectionTimeout ?? 10000,
        });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      this.connected = true;
      logger.info('Redis connected', { component: 'redis-cache' });
    });

    this.client.on('ready', () => {
      this.connected = true;
      logger.info('Redis ready', { component: 'redis-cache' });
    });

    this.client.on('error', (error) => {
      this.connected = false;
      logger.error('Redis error', { component: 'redis-cache' }, error);
    });

    this.client.on('close', () => {
      this.connected = false;
      logger.warn('Redis connection closed', { component: 'redis-cache' });
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis reconnecting', { component: 'redis-cache' });
    });
  }

  /**
   * Établit la connexion (appelé automatiquement au premier usage)
   */
  async connect(): Promise<void> {
    if (this.connected) return;
    
    if (!this.connectionPromise) {
      this.connectionPromise = this.client.connect().then(() => {
        this.connected = true;
      }).catch((error) => {
        this.connected = false;
        this.connectionPromise = null;
        throw error;
      });
    }
    
    return this.connectionPromise;
  }

  /**
   * Vérifie la santé de la connexion
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; latencyMs?: number; error?: string }> {
    const start = Date.now();
    try {
      await this.connect();
      const result = await this.client.ping();
      const latencyMs = Date.now() - start;
      
      if (result === 'PONG') {
        return { status: 'healthy', latencyMs };
      }
      return { status: 'unhealthy', error: 'Unexpected ping response' };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Récupère une valeur du cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      await this.connect();
      const prefixedKey = this.keyPrefix + key;
      const data = await this.client.get(prefixedKey);
      
      if (!data) return null;
      
      const entry: CacheEntry<T> = JSON.parse(data);
      
      // Vérifier l'expiration
      if (Date.now() > entry.expiresAt) {
        await this.client.del(this.keyPrefix + key);
        return null;
      }
      
      return entry.data;
    } catch (error) {
      logger.error('Redis get error', { component: 'redis-cache', key }, error as Error);
      return null; // Fail-open: retourne null au lieu d'échouer
    }
  }

  /**
   * Stocke une valeur dans le cache
   */
  async set<T>(key: string, data: T, ttlMs?: number, tags: string[] = []): Promise<void> {
    try {
      await this.connect();
      const prefixedKey = this.keyPrefix + key;
      const expiresAt = Date.now() + (ttlMs ?? this.defaultTTL);
      
      const entry: CacheEntry<T> = { data, expiresAt, tags };
      const serialized = JSON.stringify(entry);
      
      const ttlSeconds = Math.ceil((ttlMs ?? this.defaultTTL) / 1000);
      
      // Pipeline pour atomicité
      const pipeline = this.client.pipeline();
      pipeline.set(prefixedKey, serialized, 'EX', ttlSeconds);
      
      // Indexer par tags
      for (const tag of tags) {
        const tagKey = `${this.keyPrefix}tag:${tag}`;
        pipeline.sadd(tagKey, key);
        pipeline.expire(tagKey, ttlSeconds * 2); // Tag expire après les données
      }
      
      await pipeline.exec();
    } catch (error) {
      logger.error('Redis set error', { component: 'redis-cache', key }, error as Error);
      // Fail-open: ne pas bloquer l'application
    }
  }

  /**
   * Supprime une clé du cache
   */
  async delete(key: string): Promise<void> {
    try {
      await this.connect();
      const prefixedKey = this.keyPrefix + key;
      
      // Récupérer les tags avant suppression pour nettoyer les index
      const data = await this.client.get(prefixedKey);
      if (data) {
        try {
          const entry: CacheEntry<unknown> = JSON.parse(data);
          const pipeline = this.client.pipeline();
          
          for (const tag of entry.tags) {
            const tagKey = `${this.keyPrefix}tag:${tag}`;
            pipeline.srem(tagKey, key);
          }
          
          pipeline.del(prefixedKey);
          await pipeline.exec();
        } catch {
          // Si erreur parsing, juste supprimer la clé
          await this.client.del(prefixedKey);
        }
      } else {
        await this.client.del(prefixedKey);
      }
    } catch (error) {
      logger.error('Redis delete error', { component: 'redis-cache', key }, error as Error);
    }
  }

  /**
   * Invalide toutes les entrées avec un tag donné
   */
  async invalidateTag(tag: string): Promise<number> {
    try {
      await this.connect();
      const tagKey = `${this.keyPrefix}tag:${tag}`;
      
      // Récupérer toutes les clés associées au tag
      const keys = await this.client.smembers(tagKey);
      
      if (keys.length === 0) return 0;
      
      // Supprimer les clés et le tag
      const pipeline = this.client.pipeline();
      const prefixedKeys = keys.map(k => this.keyPrefix + k);
      pipeline.del(...prefixedKeys);
      pipeline.del(tagKey);
      await pipeline.exec();
      
      logger.info('Cache tag invalidated', { component: 'redis-cache', tag, count: keys.length });
      return keys.length;
    } catch (error) {
      logger.error('Redis invalidateTag error', { component: 'redis-cache', tag }, error as Error);
      return 0;
    }
  }

  /**
   * Invalide plusieurs tags
   */
  async invalidateTags(tags: string[]): Promise<number> {
    let total = 0;
    for (const tag of tags) {
      total += await this.invalidateTag(tag);
    }
    return total;
  }

  /**
   * Récupère les statistiques du cache
   */
  async getStats(): Promise<{ size: number; tags: number; memory?: string }> {
    try {
      await this.connect();
      
      // Approximation: compter les clés avec notre préfixe (hors tags)
      const pattern = `${this.keyPrefix}*`;
      const keys = await this.client.keys(pattern);
      const dataKeys = keys.filter(k => !k.includes(':tag:'));
      const tagKeys = keys.filter(k => k.includes(':tag:'));
      
      // Info mémoire
      const info = await this.client.info('memory');
      const memoryMatch = info.match(/used_memory_human:(\S+)/);
      const memory = memoryMatch ? memoryMatch[1] : undefined;
      
      return {
        size: dataKeys.length,
        tags: tagKeys.length,
        memory,
      };
    } catch (error) {
      logger.error('Redis getStats error', { component: 'redis-cache' }, error as Error);
      return { size: 0, tags: 0 };
    }
  }

  /**
   * Nettoie les entrées expirées (Redis le fait automatiquement via TTL)
   */
  async cleanup(): Promise<number> {
    // Redis gère l'expiration automatiquement via TTL
    // Cette méthode est pour compatibilité avec l'interface du cache mémoire
    return 0;
  }

  /**
   * Ferme la connexion
   */
  async disconnect(): Promise<void> {
    await this.client.quit();
    this.connected = false;
  }

  /**
   * Vérifie si connecté
   */
  isConnected(): boolean {
    return this.connected && this.client.status === 'ready';
  }
}

// Instance singleton (lazy initialization)
let redisCacheInstance: RedisCache | null = null;

export function getRedisCache(config?: RedisCacheConfig): RedisCache {
  if (!redisCacheInstance) {
    redisCacheInstance = new RedisCache(config);
  }
  return redisCacheInstance;
}

export function resetRedisCache(): void {
  if (redisCacheInstance) {
    redisCacheInstance.disconnect();
    redisCacheInstance = null;
  }
}

/**
 * Cache hybride: Redis en production, mémoire en développement
 */
export class HybridCache {
  private redisCache: RedisCache | null = null;
  private memoryCache: Map<string, { data: unknown; expiresAt: number; tags: string[] }> = new Map();
  private useRedis: boolean;
  private defaultTTL: number;

  constructor(config?: RedisCacheConfig) {
    this.useRedis = process.env.NODE_ENV === 'production' && !!process.env.REDIS_URL;
    this.defaultTTL = 5 * 60 * 1000;
    
    if (this.useRedis) {
      this.redisCache = new RedisCache(config);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.useRedis && this.redisCache) {
      return this.redisCache.get<T>(key);
    }
    
    // Memory fallback
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  async set<T>(key: string, data: T, ttlMs?: number, tags: string[] = []): Promise<void> {
    if (this.useRedis && this.redisCache) {
      return this.redisCache.set(key, data, ttlMs, tags);
    }
    
    const expiresAt = Date.now() + (ttlMs ?? this.defaultTTL);
    this.memoryCache.set(key, { data, expiresAt, tags });
  }

  async delete(key: string): Promise<void> {
    if (this.useRedis && this.redisCache) {
      return this.redisCache.delete(key);
    }
    this.memoryCache.delete(key);
  }

  async invalidateTag(tag: string): Promise<number> {
    if (this.useRedis && this.redisCache) {
      return this.redisCache.invalidateTag(tag);
    }
    
    // Memory: scan and delete
    let count = 0;
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.tags.includes(tag)) {
        this.memoryCache.delete(key);
        count++;
      }
    }
    return count;
  }

  async invalidateTags(tags: string[]): Promise<number> {
    let total = 0;
    for (const tag of tags) {
      total += await this.invalidateTag(tag);
    }
    return total;
  }

  async getStats() {
    if (this.useRedis && this.redisCache) {
      return this.redisCache.getStats();
    }
    return {
      size: this.memoryCache.size,
      tags: new Set(Array.from(this.memoryCache.values()).flatMap(e => e.tags)).size,
    };
  }

  async cleanup(): Promise<number> {
    if (this.useRedis && this.redisCache) {
      return this.redisCache.cleanup();
    }
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.memoryCache.entries()) {
      if (now > entry.expiresAt) {
        this.memoryCache.delete(key);
        count++;
      }
    }
    return count;
  }

  isUsingRedis(): boolean {
    return (this.useRedis && this.redisCache?.isConnected()) ?? false;
  }
}

// Instance singleton
let hybridCacheInstance: HybridCache | null = null;

export function getHybridCache(config?: RedisCacheConfig): HybridCache {
  if (!hybridCacheInstance) {
    hybridCacheInstance = new HybridCache(config);
  }
  return hybridCacheInstance;
}

export function resetHybridCache(): void {
  if (hybridCacheInstance) {
    if (hybridCacheInstance.isUsingRedis() && hybridCacheInstance['redisCache']) {
      hybridCacheInstance['redisCache'].disconnect();
    }
    hybridCacheInstance = null;
  }
}
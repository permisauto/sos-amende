/**
 * DataLoader pour batching des requêtes Prisma
 * Évite les problèmes N+1 en regroupant les requêtes identiques
 */

import { Dossier, Payment, FailleJuridique } from "@/prisma/generated-client";

type LoadedUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  credits: number;
  signatureUrl: string | null;
  telephone: string | null;
};

interface LoadOptions<K, V> {
  batchKey: (key: K) => string;
  batchLoadFn: (keys: K[]) => Promise<V[]>;
  cache?: boolean;
  maxBatchSize?: number;
}

interface BatchItem<K, V> {
  key: K;
  resolve: (value: V) => void;
  reject: (error: Error) => void;
}

/**
 * DataLoader générique simple
 */
export class DataLoader<K, V> {
  private queue: BatchItem<K, V>[] = [];
  private loading = false;
  private cache = new Map<string, V>();
  private options: LoadOptions<K, V>;

  constructor(options: LoadOptions<K, V>) {
    this.options = {
      cache: true,
      maxBatchSize: 100,
      ...options,
    };
  }

  /**
   * Charge une valeur par clé
   */
  async load(key: K): Promise<V> {
    const cacheKey = this.options.batchKey(key);
    
    // Vérifier le cache
    if (this.options.cache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Ajouter à la queue
    return new Promise<V>((resolve, reject) => {
      this.queue.push({ key, resolve, reject });
      this.scheduleBatch();
    });
  }

  /**
   * Charge plusieurs clés
   */
  async loadMany(keys: K[]): Promise<(V | Error)[]> {
    const promises = keys.map(key => this.load(key));
    return Promise.allSettled(promises).then(results => 
      results.map(r => r.status === 'fulfilled' ? r.value : r.reason)
    );
  }

  /**
   * Planifie l'exécution du batch
   */
  private scheduleBatch(): void {
    if (this.loading) return;
    
    // Micro-task pour grouper les appels synchrones
    queueMicrotask(() => this.executeBatch());
  }

  /**
   * Exécute le batch
   */
  private async executeBatch(): Promise<void> {
    if (this.queue.length === 0) return;

    this.loading = true;
    const batch = this.queue.splice(0, this.options.maxBatchSize);
    const keys = batch.map(item => item.key);

    try {
      const results = await this.options.batchLoadFn(keys);
      
      // Résoudre chaque promesse
      batch.forEach((item, index) => {
        const value = results[index];
        const cacheKey = this.options.batchKey(item.key);
        
        if (this.options.cache) {
          this.cache.set(cacheKey, value);
        }
        
        item.resolve(value);
      });
    } catch (error) {
      // Rejeter toutes les promesses du batch
      batch.forEach(item => {
        item.reject(error as Error);
      });
    } finally {
      this.loading = false;
      
      // Traiter la queue restante
      if (this.queue.length > 0) {
        this.scheduleBatch();
      }
    }
  }

  /**
   * Vide le cache
   */
  clear(key?: K): void {
    if (key) {
      this.cache.delete(this.options.batchKey(key));
    } else {
      this.cache.clear();
    }
  }

  /**
   * Précharge une valeur dans le cache
   */
  prime(key: K, value: V): void {
    if (this.options.cache) {
      this.cache.set(this.options.batchKey(key), value);
    }
  }
}

/**
 * DataLoaders spécialisés pour le domaine
 */

// Dossier loader
export const dossierLoader = new DataLoader<string, Dossier | null>({
  batchKey: (id) => id,
  batchLoadFn: async (ids): Promise<(Dossier | null)[]> => {
    const { prisma } = await import("@/lib/prisma");
    const dossiers = await prisma.dossier.findMany({
      where: { id: { in: ids } },
      include: {
        user: { select: { id: true, name: true, email: true, role: true, credits: true } },
        failleJuridique: { select: { id: true, titreFaille: true, articleLoi: true } },
      },
    });
    
    const dossiersArray = Array.isArray(dossiers) ? dossiers : [];
    const map = new Map(dossiersArray.map(d => [d.id, d]));
    return ids.map(id => map.get(id) ?? null);
  },
});

// User loader
export const userLoader = new DataLoader<string, LoadedUser | null>({
  batchKey: (id) => id,
  batchLoadFn: async (ids): Promise<(LoadedUser | null)[]> => {
    const { prisma } = await import("@/lib/prisma");
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        credits: true,
        signatureUrl: true,
        telephone: true,
      },
    });
    
    const map = new Map(users.map(u => [u.id, u]));
    return ids.map(id => map.get(id) ?? null);
  },
});

// Payment loader
export const paymentLoader = new DataLoader<string, Payment | null>({
  batchKey: (id) => id,
  batchLoadFn: async (ids) => {
    const { prisma } = await import("@/lib/prisma");
    const payments = await prisma.payment.findMany({
      where: { id: { in: ids } },
      include: {
        user: { select: { id: true, name: true, email: true, role: true, telephone: true } },
        dossier: { select: { id: true, type: true, statut: true, num_pv: true } },
      },
    });
    
    const map = new Map(payments.map(p => [p.id, p]));
    return ids.map(id => map.get(id) ?? null);
  },
});

// Faille loader
export const failleLoader = new DataLoader<string, FailleJuridique | null>({
  batchKey: (id) => id,
  batchLoadFn: async (ids) => {
    const { prisma } = await import("@/lib/prisma");
    const failles = await prisma.failleJuridique.findMany({
      where: { id: { in: ids } },
      include: {
        sources: { select: { id: true, cle: true, source: true, titre: true, statut: true } },
      },
    });
    
    const map = new Map(failles.map(f => [f.id, f]));
    return ids.map(id => map.get(id) ?? null);
  },
});

/**
 * Loader pour relations (ex: dossiers d'un user)
 * K = string (IDs sont toujours des strings)
 */
export function createRelationLoader<T>(
  getRelation: (parentIds: string[]) => Promise<T[]>,
  getParentId: (item: T) => string,
  batchKey: (key: string) => string = (k) => k
): DataLoader<string, T[]> {
  return new DataLoader<string, T[]>({
    batchKey,
    batchLoadFn: async (keys: string[]) => {
      const allItems = await getRelation(keys);
      const grouped = new Map<string, T[]>();
      
      for (const item of allItems) {
        const parentId = getParentId(item);
        if (!grouped.has(parentId)) {
          grouped.set(parentId, []);
        }
        grouped.get(parentId)!.push(item);
      }
      
      return keys.map(key => grouped.get(key) ?? []);
    }
  })
}

/**
 * Helper pour créer un loader de relation inverse
 * ex: user -> dossiers
 */
export const userDossiersLoader = createRelationLoader(
  async (userIds) => {
    const { prisma } = await import("@/lib/prisma");
    return prisma.dossier.findMany({
      where: { userId: { in: userIds } },
      include: {
        failleJuridique: { select: { id: true, titreFaille: true, articleLoi: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },
  (dossier) => dossier.userId,
  (id) => `user-dossiers:${id}`
);

/**
 * Helper pour dossier -> failles retenues
 */
export const dossierFaillesLoader = createRelationLoader(
  async (dossierIds) => {
    const { prisma } = await import("@/lib/prisma");
    return prisma.dossierFaille.findMany({
      where: { dossierId: { in: dossierIds } },
      include: {
        faille: true,
      },
    });
  },
  (df) => df.dossierId,
  (id) => `dossier-failles:${id}`
);

/**
 * Helper pour payment -> dossier
 */
export const paymentDossierLoader = createRelationLoader(
  async (paymentIds) => {
    const { prisma } = await import("@/lib/prisma");
    return prisma.payment.findMany({
      where: { id: { in: paymentIds } },
      include: {
        dossier: { select: { id: true, type: true, statut: true, num_pv: true } },
      },
    });
  },
  (payment) => payment.id,
  (id) => `payment-dossier:${id}`
);

/**
 * Registry des loaders pour nettoyage
 */
export const loaders = {
  dossier: dossierLoader,
  user: userLoader,
  payment: paymentLoader,
  faille: failleLoader,
  userDossiers: userDossiersLoader,
  dossierFailles: dossierFaillesLoader,
  paymentDossier: paymentDossierLoader,
} as const;

/**
 * Vide tous les caches
 */
export function clearAllLoaders(): void {
  for (const loader of Object.values(loaders)) {
    loader.clear();
  }
}

/**
 * Précharge des données (pour warmup)
 */
export async function warmupLoaders(): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  
  // Précharger les failles actives
  const failles = await prisma.failleJuridique.findMany({
    where: { statut: 'ACTIVE' },
    select: { id: true },
  });
  
  for (const faille of failles) {
    failleLoader.prime(faille.id, null); // Sera chargé à la demande
  }
}
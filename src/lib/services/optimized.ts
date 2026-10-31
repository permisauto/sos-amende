/**
 * Services optimisés avec cache, circuit breakers et DataLoaders
 */

import { Dossier, DossierStatut, DossierType, Prisma } from "@/prisma/generated-client";
import { dossierRepository } from "@/lib/repositories";
import { AuditLogger } from "./audit";
import { queryCache, CacheKeys, CacheTags } from "@/lib/cache";
import { ExternalCircuits } from "@/lib/circuit-breaker";
import { dossierLoader, userDossiersLoader, clearAllLoaders } from "@/lib/dataloader";

/**
 * DossierService optimisé
 */
export class OptimizedDossierService {
  /**
   * Crée un dossier avec invalidation de cache
   */
  static async createDossier(data: {
    userId: string;
    type: DossierType;
    pvUrl: string;
    pvTexte?: string;
    extractedData: Prisma.JsonObject;
    prix: number;
    voieProcedure?: string;
    classeContravention?: number;
    consignationMontant?: number;
    dateLimite?: Date;
  }): Promise<Dossier> {
    const dossier = await dossierRepository.create({
      user: { connect: { id: data.userId } },
      type: data.type,
      statut: "EN_ANALYSE",
      pvUrl: data.pvUrl,
      pvTexte: data.pvTexte,
      extractedData: data.extractedData,
      prix: data.prix,
      voieProcedure: data.voieProcedure,
      classeContravention: data.classeContravention,
      consignationMontant: data.consignationMontant,
      dateLimite: data.dateLimite,
    });

    // Invalider les caches liés
    queryCache.invalidateTags([
      CacheTags.user(data.userId),
    ]);

    // Précharger dans DataLoader
    dossierLoader.prime(dossier.id, dossier);

    await AuditLogger.log({
      userId: data.userId,
      action: "CREATE",
      resource: "Dossier",
      resourceId: dossier.id,
      metadata: { type: data.type, prix: data.prix },
    });

    return dossier;
  }

  /**
   * Récupère un dossier avec cache
   */
  static async getDossier(id: string, userId?: string, userRole?: string): Promise<Dossier | null> {
    const cacheKey = CacheKeys.dossier(id);
    
    // Essayer le cache
    const cached = queryCache.get<Dossier>(cacheKey);
    if (cached && (!userId || userRole === "ADMIN" || cached.userId === userId)) {
      return cached;
    }

    // Via DataLoader (batching + cache)
    const dossier = await dossierLoader.load(id);
    
    if (!dossier) return null;
    
    // Vérifier l'accès
    if (userId && userRole !== "ADMIN" && dossier.userId !== userId) {
      return null;
    }

    // Mettre en cache
    queryCache.set(cacheKey, dossier, 5 * 60 * 1000, [
      CacheTags.dossier(id),
      CacheTags.user(dossier.userId),
    ]);

    return dossier;
  }

  /**
   * Récupère les dossiers d'un client avec cache
   */
  static async getDossiersClient(userId: string, options?: { 
    limit?: number; 
    cursor?: string;
    statut?: DossierStatut | DossierStatut[];
  }): Promise<Dossier[]> {
    const cacheKey = CacheKeys.dossierList(userId, JSON.stringify(options));
    
    const cached = queryCache.get<Dossier[]>(cacheKey);
    if (cached) return cached;

    // Utiliser le DataLoader pour batching
    const dossiers = await userDossiersLoader.load(userId);
    
    // Filtrer côté application (peut être optimisé avec Prisma cursor)
    let filtered = dossiers;
    if (options?.statut) {
      const statuts = Array.isArray(options.statut) ? options.statut : [options.statut];
      filtered = filtered.filter(d => statuts.includes(d.statut));
    }
    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    // Cache avec tags pour invalidation granulaire
    queryCache.set(cacheKey, filtered, 2 * 60 * 1000, [
      CacheTags.user(userId),
    ]);

    return filtered;
  }

  /**
   * Récupère les dossiers pour juriste (sans filtre userId)
   */
  static async getDossiersPourJuriste(
    filters?: { 
      statut?: DossierStatut | DossierStatut[]; 
      limit?: number;
      page?: number;
    }
  ): Promise<{ dossiers: Dossier[]; total: number }> {
    const cacheKey = `juriste:dossiers:${JSON.stringify(filters)}`;
    
    const cached = queryCache.get<{ dossiers: Dossier[]; total: number }>(cacheKey);
    if (cached) return cached;

    const where: Prisma.DossierWhereInput = {};
    if (filters?.statut) {
      where.statut = Array.isArray(filters.statut) ? { in: filters.statut } : filters.statut;
    }

    const [dossiers, total] = await Promise.all([
      dossierRepository.findMany(where, {
        take: filters?.limit ?? 100,
        skip: ((filters?.page ?? 1) - 1) * (filters?.limit ?? 100),
      }),
      dossierRepository.count(where),
    ]);

    const result = { dossiers, total };
    queryCache.set(cacheKey, result, 30 * 1000, [CacheTags.dossier('list')]); // Cache court pour juriste
    
    return result;
  }

  /**
   * Met à jour un dossier avec invalidation de cache
   */
  static async updateDossier(
    id: string, 
    data: Prisma.DossierUpdateInput, 
    userId: string, 
    userRole: string
  ): Promise<Dossier> {
    const dossier = await dossierRepository.update(id, data, userId, userRole);

    // Invalider les caches
    queryCache.invalidateTags([
      CacheTags.dossier(id),
      CacheTags.user(dossier.userId),
      'dossier:list', // Invalider les listes
    ]);

    // Mettre à jour le DataLoader
    dossierLoader.prime(id, dossier);

    await AuditLogger.log({
      userId,
      action: "UPDATE",
      resource: "Dossier",
      resourceId: id,
      metadata: { fields: Object.keys(data) },
    });

    return dossier;
  }

  /**
   * Valide un dossier par le juriste
   */
  static async validerParJuriste(
    dossierId: string,
    juristeId: string,
    data: {
      lettreGeneree: string;
      refereGenere?: string;
      canalEnvoi: "ANTAI" | "TELERECOURS" | "LRAR";
    }
  ): Promise<Dossier> {
    const dossier = await dossierRepository.updateStatutWithEvent(
      dossierId,
      "PRET",
      "VALIDATION",
      `Lettre validée par le juriste. Canal: ${data.canalEnvoi}`,
      juristeId,
      "JURISTE"
    );

    await dossierRepository.update(dossierId, {
      lettreGeneree: data.lettreGeneree,
      refereGenere: data.refereGenere,
      canalEnvoi: data.canalEnvoi,
      valideLe: new Date(),
    }, juristeId, "JURISTE");

    // Invalider caches
    queryCache.invalidateTags([
      CacheTags.dossier(dossierId),
      'dossier:list',
      'juriste:dossiers',
    ]);

    dossierLoader.prime(dossierId, dossier);

    await AuditLogger.log({
      userId: juristeId,
      action: "VALIDATE",
      resource: "Dossier",
      resourceId: dossierId,
      metadata: { canal: data.canalEnvoi },
    });

    return dossier;
  }

  /**
   * Envoie un dossier
   */
  static async envoyer(
    dossierId: string,
    juristeId: string,
    data: {
      numeroDepot: string;
      canalEnvoi: "ANTAI" | "TELERECOURS" | "LRAR";
      preuveDepotUrl?: string;
    }
  ): Promise<Dossier> {
    const dossier = await dossierRepository.updateStatutWithEvent(
      dossierId,
      "ENVOYE",
      "ENVOI",
      `Envoyé via ${data.canalEnvoi}. N° dépôt: ${data.numeroDepot}`,
      juristeId,
      "JURISTE"
    );

    await dossierRepository.update(dossierId, {
      numeroDepot: data.numeroDepot,
      canalEnvoi: data.canalEnvoi,
      decisionAttendueLe: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
    }, juristeId, "JURISTE");

    queryCache.invalidateTags([
      CacheTags.dossier(dossierId),
      'dossier:list',
      'juriste:dossiers',
    ]);

    dossierLoader.prime(dossierId, dossier);

    await AuditLogger.log({
      userId: juristeId,
      action: "SEND",
      resource: "Dossier",
      resourceId: dossierId,
      metadata: { canal: data.canalEnvoi, numeroDepot: data.numeroDepot },
    });

    return dossier;
  }

  /**
   * Enregistre la décision OMP
   */
  static async enregistrerDecision(
    dossierId: string,
    juristeId: string,
    decision: "ACCEPTE" | "REJETE",
    detail?: string
  ): Promise<Dossier> {
    const dossier = await dossierRepository.updateStatutWithEvent(
      dossierId,
      "RESOLU",
      "DECISION",
      `Décision OMP: ${decision}${detail ? ` - ${detail}` : ""}`,
      juristeId,
      "JURISTE"
    );

    await dossierRepository.update(dossierId, {
      decisionOmp: decision,
      decisionDetail: detail,
      decisionRecupereeLe: new Date(),
      reponsePortail: detail,
    }, juristeId, "JURISTE");

    queryCache.invalidateTags([
      CacheTags.dossier(dossierId),
      'dossier:list',
      'juriste:dossiers',
    ]);

    dossierLoader.prime(dossierId, dossier);

    await AuditLogger.log({
      userId: juristeId,
      action: "DECISION",
      resource: "Dossier",
      resourceId: dossierId,
      metadata: { decision, detail },
    });

    return dossier;
  }

  /**
   * Statistiques juriste avec cache
   */
  static async getStatsJuriste(): Promise<Record<string, number>> {
    const cacheKey = CacheKeys.statsJuriste();
    
    const cached = queryCache.get<Record<string, number>>(cacheKey);
    if (cached) return cached;

    const stats = await dossierRepository.getStatsByStatut();
    queryCache.set(cacheKey, stats, 60 * 1000, ['dossier:list']); // 1 min pour stats
    
    return stats;
  }
}

/**
 * Service OCR avec Circuit Breaker
 */
export class OptimizedOcrService {
  static async extractText(buffer: Buffer, filename: string): Promise<{
    texte: string | null;
    data: Prisma.JsonObject;
  } | null> {
    const circuit = ExternalCircuits.ocr();

    return circuit.execute(async () => {
      const { extrairePv, getOcrProvider } = await import("@/lib/ocr");
      const { normaliserPv } = await import("@/lib/ocr");
      
      const provider = getOcrProvider();
      if (provider === "aucun") return null;

      const ocr = await extrairePv(buffer, filename);
      if (!ocr?.texte) return null;

      const data = normaliserPv(ocr.texte);
      return { texte: ocr.texte, data };
    });
  }

  /**
   * Vérifie la santé du circuit OCR
   */
  static getOcrHealth(): { state: string; metrics: any } {
    const circuit = ExternalCircuits.ocr();
    return {
      state: circuit.getState(),
      metrics: circuit.getMetrics(),
    };
  }
}

/**
 * Service Veille avec Circuit Breakers
 */
export class OptimizedVeilleService {
  static async fetchGroq(prompt: string): Promise<string | null> {
    const circuit = ExternalCircuits.groq();

    return circuit.execute(async () => {
      const { Groq } = await import("groq-sdk");
      const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
      
      const completion = await client.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.1-70b-versatile",
        temperature: 0.1,
        max_tokens: 2000,
      });
      
      return completion.choices[0]?.message?.content ?? null;
    });
  }

  static async fetchOpenMeteo(lat: number, lon: number, date: string): Promise<any> {
    const circuit = ExternalCircuits.openMeteo();

    return circuit.execute(async () => {
      const response = await fetch(
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&timezone=Europe/Paris`,
        { signal: AbortSignal.timeout(10000) }
      );
      
      if (!response.ok) throw new Error(`OpenMeteo HTTP ${response.status}`);
      return response.json();
    });
  }

  static async fetchBan(address: string): Promise<any> {
    const circuit = ExternalCircuits.ban();

    return circuit.execute(async () => {
      const response = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`,
        { signal: AbortSignal.timeout(10000) }
      );
      
      if (!response.ok) throw new Error(`BAN HTTP ${response.status}`);
      return response.json();
    });
  }

  static async fetchTravaux(lat: number, lon: number): Promise<any> {
    const circuit = ExternalCircuits.travaux();

    return circuit.execute(async () => {
      const { basesTravaux } = await import("@/lib/preuves-api");
      const base = basesTravaux()[0];
      if (!base) return null;

      const response = await fetch(
        `${base.replace(/\/+$/, "")}/records?lat=${lat}&lon=${lon}&radius=5000&limit=10`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) }
      );
      
      if (!response.ok) throw new Error(`Travaux HTTP ${response.status}`);
      return response.json();
    });
  }

  static async fetchDataGouvRadars(): Promise<any> {
    const circuit = ExternalCircuits.dataGouv();

    return circuit.execute(async () => {
      const response = await fetch(
        "https://static.data.gouv.fr/resources/radars-automatiques/20181025-141231/radars.csv",
        { signal: AbortSignal.timeout(30000) }
      );
      
      if (!response.ok) throw new Error(`DataGouv HTTP ${response.status}`);
      return response.text();
    });
  }
}

/**
 * Nettoyage global des caches (pour maintenance)
 */
export async function clearAllCaches(): Promise<void> {
  queryCache.cleanup();
  clearAllLoaders();
  // Les circuit breakers ne sont pas nettoyés (état persistant)
}

/**
 * Stats globales de santé
 */
export function getSystemHealth(): {
  cache: ReturnType<typeof queryCache.getStats>;
  circuits: Record<string, { state: string; failures: number }>;
  loaders: Record<string, { queueSize: number }>;
} {
  const circuits: Record<string, { state: string; failures: number }> = {};
  for (const [name, circuit] of Object.entries(ExternalCircuits)) {
    try {
      const cb = circuit();
      circuits[name] = {
        state: cb.getState(),
        failures: cb.getMetrics().failures,
      };
    } catch {
      circuits[name] = { state: 'ERROR', failures: -1 };
    }
  }

  return {
    cache: queryCache.getStats(),
    circuits,
    loaders: {
      dossier: { queueSize: 0 }, // DataLoader n'expose pas la queue
      user: { queueSize: 0 },
      payment: { queueSize: 0 },
      faille: { queueSize: 0 },
    },
  };
}
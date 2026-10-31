import { Prisma, Dossier, DossierStatut } from "@/prisma/generated-client";
import { prisma } from "@/lib/prisma";
import { IRepository, DossierWhereInput, DossierCreateInput, DossierUpdateInput, FindManyOptions } from "./base";

/**
 * DossierRepository - Couche d'accès aux données pour les dossiers
 * Implémente l'isolation des locataires (tenant isolation) et la journalisation
 */
export class DossierRepository implements IRepository<Dossier, Dossier, DossierCreateInput, DossierUpdateInput, DossierWhereInput> {
  /**
   * Trouve un dossier par son ID avec vérification d'accès optionnelle
   */
  async findUnique(id: string, userId?: string, userRole?: string): Promise<Dossier | null> {
    const where: Prisma.DossierWhereUniqueInput = { id };
    
    // Note: Pour findUnique, on ne peut pas filtrer par userId dans where
    // La vérification se fait après la récupération
    const dossier = await prisma.dossier.findUnique({
      where,
      include: this.getDefaultIncludes(),
    });
    
    if (dossier && userId && userRole !== "ADMIN" && dossier.userId !== userId) {
      return null; // Accès refusé
    }
    
    return dossier;
  }

  /**
   * Trouve le premier dossier correspondant aux critères
   */
  async findFirst(where: DossierWhereInput, userId?: string, userRole?: string): Promise<Dossier | null> {
    if (userId && userRole !== "ADMIN") {
      where.userId = userId;
    }
    
    return prisma.dossier.findFirst({
      where,
      include: this.getDefaultIncludes(),
    });
  }

  /**
   * Trouve plusieurs dossiers avec pagination et tri
   */
  async findMany(where: DossierWhereInput, options?: FindManyOptions, userId?: string, userRole?: string): Promise<Dossier[]> {
    if (userId && userRole !== "ADMIN") {
      where.userId = userId;
    }
    
    const useSelect = options?.select !== undefined;
    const useInclude = !useSelect && (options?.include !== undefined || true);
    
    return prisma.dossier.findMany({
      where,
      orderBy: options?.orderBy ?? { createdAt: "desc" },
      take: options?.take ?? 50,
      skip: options?.skip ?? 0,
      ...(useSelect ? { select: options!.select! } : {}),
      ...(useInclude ? { include: options?.include ?? this.getDefaultIncludes() } : {}),
    });
  }

  /**
   * Crée un nouveau dossier
   */
  async create(data: DossierCreateInput): Promise<Dossier> {
    return prisma.dossier.create({
      data,
      include: this.getDefaultIncludes(),
    });
  }

  /**
   * Met à jour un dossier avec vérification d'accès
   */
  async update(id: string, data: DossierUpdateInput, userId?: string, userRole?: string): Promise<Dossier> {
    const where: Prisma.DossierWhereUniqueInput = { id };
    
    // Vérifier l'accès avant mise à jour
    if (userId && userRole !== "ADMIN") {
      const existing = await prisma.dossier.findUnique({ where: { id }, select: { userId: true } });
      if (!existing || existing.userId !== userId) {
        throw new Error("Accès refusé");
      }
    }
    
    return prisma.dossier.update({
      where,
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: this.getDefaultIncludes(),
    });
  }

  /**
   * Supprime un dossier (soft delete via statut)
   */
  async delete(id: string, userId?: string, userRole?: string): Promise<Dossier> {
    const where: Prisma.DossierWhereUniqueInput = { id };
    
    if (userId && userRole !== "ADMIN") {
      const existing = await prisma.dossier.findUnique({ where: { id }, select: { userId: true } });
      if (!existing || existing.userId !== userId) {
        throw new Error("Accès refusé");
      }
    }
    
    // Soft delete : passage en ANNULE au lieu de suppression réelle
    return prisma.dossier.update({
      where,
      data: {
        statut: "ANNULE",
        updatedAt: new Date(),
      },
      include: this.getDefaultIncludes(),
    });
  }

  /**
   * Compte les dossiers correspondants
   */
  async count(where: DossierWhereInput, userId?: string, userRole?: string): Promise<number> {
    if (userId && userRole !== "ADMIN") {
      where.userId = userId;
    }
    
    return prisma.dossier.count({ where });
  }

  /**
   * Méthodes spécialisées pour le métier
   */

  /**
   * Trouve les dossiers par statut pour un juriste (sans filtre userId)
   */
  async findByStatutForJuriste(statut: DossierStatut | DossierStatut[], options?: FindManyOptions): Promise<Dossier[]> {
    const where: DossierWhereInput = {
      statut: Array.isArray(statut) ? { in: statut } : statut,
    };
    
    return this.findMany(where, options);
  }

  /**
   * Trouve les dossiers en attente de validation pour un juriste
   */
  async findEnAttenteValidation(options?: FindManyOptions): Promise<Dossier[]> {
    return this.findByStatutForJuriste(
      ["EN_ATTENTE_VALIDATION", "A_VERIFIER", "PRET"],
      options
    );
  }

  /**
   * Trouve les dossiers d'un client spécifique
   */
  async findByUserId(userId: string, options?: FindManyOptions): Promise<Dossier[]> {
    return this.findMany({ userId }, options, userId);
  }

  /**
   * Trouve les dossiers avec leurs failles candidates
   */
  async findWithFailles(where: DossierWhereInput, userId?: string, userRole?: string): Promise<Dossier[]> {
    if (userId && userRole !== "ADMIN") {
      where.userId = userId;
    }
    
    return prisma.dossier.findMany({
      where,
      include: {
        ...this.getDefaultIncludes(),
        faillesRetenues: {
          include: {
            faille: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  /**
   * Met à jour le statut et ajoute un événement
   */
  async updateStatutWithEvent(
    id: string,
    statut: DossierStatut,
    eventType: string,
    eventDetail: string | null,
    userId?: string,
    userRole?: string
  ): Promise<Dossier> {
    return prisma.$transaction(async (tx) => {
      const where: Prisma.DossierWhereUniqueInput = { id };
      
      if (userId && userRole !== "ADMIN") {
        const existing = await tx.dossier.findUnique({ where: { id }, select: { userId: true } });
        if (!existing || existing.userId !== userId) {
          throw new Error("Accès refusé");
        }
      }
      
      const dossier = await tx.dossier.update({
        where,
        data: {
          statut,
          updatedAt: new Date(),
        },
        include: this.getDefaultIncludes(),
      });
      
      await tx.dossierEvent.create({
        data: {
          dossierId: id,
          type: eventType as "CREATION" | "ANALYSE" | "LETTRE_GENEREE" | "EN_ATTENTE" | "SIGNATURE" | "VALIDATION" | "ENVOI" | "DECISION" | "REJET" | "RETOUR" | "PREUVE" | "MESSAGE" | "VERIFICATION_POUSSEE",
          detail: eventDetail,
        },
      });
      
      return dossier;
    });
  }

  /**
   * Obtient les statistiques par statut
   */
  async getStatsByStatut(userId?: string, userRole?: string): Promise<Record<string, number>> {
    const where: Prisma.DossierWhereInput = {};
    if (userId && userRole !== "ADMIN") {
      where.userId = userId;
    }
    
    const grouped = await prisma.dossier.groupBy({
      by: ["statut"],
      where,
      _count: true,
    });
    
    const stats: Record<string, number> = {};
    for (const g of grouped) {
      stats[g.statut] = g._count;
    }
    return stats;
  }

  /**
   * Inclusions par défaut pour les dossiers
   */
  private getDefaultIncludes() {
    return {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          credits: true,
          signatureUrl: true,
        },
      },
      failleJuridique: {
        select: {
          id: true,
          titreFaille: true,
          articleLoi: true,
        },
      },
    };
  }
}

// Instance singleton
export const dossierRepository = new DossierRepository();
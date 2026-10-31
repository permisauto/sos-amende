import { Prisma, FailleJuridique, FailleStatut } from "@/prisma/generated-client";
import { prisma } from "@/lib/prisma";
import { IRepository, FailleJuridiqueWhereInput, FindManyOptions } from "./base";

type FailleJuridiqueCreateInput = Prisma.FailleJuridiqueCreateInput;
type FailleJuridiqueUpdateInput = Prisma.FailleJuridiqueUpdateInput;

/**
 * FailleJuridiqueRepository - Couche d'accès aux données pour les failles juridiques
 * Gère le catalogue, l'auto-alimentation et la veille
 */
export class FailleJuridiqueRepository implements IRepository<FailleJuridique, FailleJuridique, FailleJuridiqueCreateInput, FailleJuridiqueUpdateInput, FailleJuridiqueWhereInput> {
  /**
   * Trouve une faille par son ID
   */
  async findUnique(id: string): Promise<FailleJuridique | null> {
    return prisma.failleJuridique.findUnique({
      where: { id },
      include: this.getDefaultIncludes(),
    });
  }

  /**
   * Trouve la première faille correspondant
   */
  async findFirst(where: FailleJuridiqueWhereInput): Promise<FailleJuridique | null> {
    return prisma.failleJuridique.findFirst({
      where,
      include: this.getDefaultIncludes(),
    });
  }

  /**
   * Trouve plusieurs failles avec filtres et pagination
   */
  async findMany(where: FailleJuridiqueWhereInput, options?: FindManyOptions): Promise<FailleJuridique[]> {
    return prisma.failleJuridique.findMany({
      where,
      orderBy: options?.orderBy ?? [
        { statut: "asc" },
        { typeInfraction: "asc" },
        { createdAt: "desc" },
      ],
      take: options?.take ?? 100,
      skip: options?.skip ?? 0,
      include: options?.include ?? this.getDefaultIncludes(),
    });
  }

  /**
   * Crée une nouvelle faille
   */
  async create(data: FailleJuridiqueCreateInput): Promise<FailleJuridique> {
    return prisma.failleJuridique.create({
      data,
      include: this.getDefaultIncludes(),
    });
  }

  /**
   * Met à jour une faille
   */
  async update(id: string, data: FailleJuridiqueUpdateInput): Promise<FailleJuridique> {
    return prisma.failleJuridique.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: this.getDefaultIncludes(),
    });
  }

  /**
   * Supprime une faille (passe en INACTIVE)
   */
  async delete(id: string): Promise<FailleJuridique> {
    return prisma.failleJuridique.update({
      where: { id },
      data: {
        statut: "INACTIVE",
        updatedAt: new Date(),
      },
      include: this.getDefaultIncludes(),
    });
  }

  /**
   * Compte les failles
   */
  async count(where: FailleJuridiqueWhereInput): Promise<number> {
    return prisma.failleJuridique.count({ where });
  }

  /**
   * Méthodes spécialisées
   */

  /**
   * Trouve les failles ACTIVES par type d'infraction
   */
  async findActiveByType(typeInfraction: "AMENDE" | "SUSPENSION"): Promise<FailleJuridique[]> {
    return this.findMany({
      typeInfraction,
      statut: "ACTIVE",
      templateLettre: { not: "" },
    });
  }

  /**
   * Trouve les failles PROPOSEE (auto-alimentation)
   */
  async findProposees(options?: FindManyOptions): Promise<FailleJuridique[]> {
    return this.findMany({ statut: "PROPOSEE" }, options);
  }

  /**
   * Trouve les failles avec template vide (à compléter)
   */
  async findWithoutTemplate(): Promise<FailleJuridique[]> {
    return prisma.failleJuridique.findMany({
      where: {
        templateLettre: { equals: "" },
      },
      include: this.getDefaultIncludes(),
    });
  }

  /**
   * Active une faille (PROPOSEE -> ACTIVE)
   */
  async activate(id: string, data?: Partial<FailleJuridiqueUpdateInput>): Promise<FailleJuridique> {
    return this.update(id, {
      statut: "ACTIVE",
      ...data,
    });
  }

  /**
   * Désactive une faille (ACTIVE -> INACTIVE)
   */
  async deactivate(id: string): Promise<FailleJuridique> {
    return this.update(id, { statut: "INACTIVE" });
  }

  /**
   * Synchronise le catalogue (upsert complet)
   */
  async syncCatalogue(failles: FailleJuridiqueCreateInput[]): Promise<{
    created: number;
    updated: number;
    errors: string[];
  }> {
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const faille of failles) {
      try {
        const existing = await prisma.failleJuridique.findUnique({
          where: { id: faille.id },
        });

        if (existing) {
          // Enrichissement non destructif : ne comble que les champs vides
          // Pour les champs JSON, on utilise undefined au lieu de null pour ne pas écraser
          const updateData: Prisma.FailleJuridiqueUpdateInput = {
            typeInfraction: faille.typeInfraction,
            titreFaille: faille.titreFaille,
            articleLoi: faille.articleLoi,
            updatedAt: new Date(),
            // Ne JAMAIS rétrograder le statut
            statut: existing.statut === "INACTIVE" ? "INACTIVE" : faille.statut,
          };

          // Ajouter seulement les champs non-null/undefined
          if (faille.regle !== undefined) updateData.regle = faille.regle;
          if (faille.templateLettre !== undefined) updateData.templateLettre = faille.templateLettre;
          if (faille.templateRefere !== undefined) updateData.templateRefere = faille.templateRefere;
          if (faille.templateGracieux !== undefined) updateData.templateGracieux = faille.templateGracieux;
          if (faille.questionsDynamiques !== undefined) updateData.questionsDynamiques = faille.questionsDynamiques;
          if (faille.source !== undefined) updateData.source = faille.source;
          if (faille.reglesDetection !== undefined) updateData.reglesDetection = faille.reglesDetection;
          if (faille.jurisprudence !== undefined) updateData.jurisprudence = faille.jurisprudence;

          await prisma.failleJuridique.update({
            where: { id: faille.id },
            data: updateData,
          });
          updated++;
        } else {
          await prisma.failleJuridique.create({
            data: {
              ...faille,
              statut: faille.statut ?? "PROPOSEE",
            },
          });
          created++;
        }
      } catch (e) {
        errors.push(`${faille.id}: ${(e as Error).message}`);
      }
    }

    return { created, updated, errors };
  }

  /**
   * Recherche textuelle multi-champs
   */
  async search(query: string, filters?: { statut?: FailleStatut; typeInfraction?: "AMENDE" | "SUSPENSION" }): Promise<FailleJuridique[]> {
    const where: FailleJuridiqueWhereInput = {
      OR: [
        { titreFaille: { contains: query, mode: "insensitive" } },
        { articleLoi: { contains: query, mode: "insensitive" } },
        { regle: { contains: query, mode: "insensitive" } },
        { templateLettre: { contains: query, mode: "insensitive" } },
        { source: { contains: query, mode: "insensitive" } },
      ],
      ...filters,
    };

    return this.findMany(where);
  }

  /**
   * Obtient les statistiques du catalogue
   */
  async getStats(): Promise<{
    active: number;
    proposee: number;
    inactive: number;
    byType: Record<string, number>;
  }> {
    const [grouped, byType] = await Promise.all([
      prisma.failleJuridique.groupBy({
        by: ["statut"],
        _count: true,
      }),
      prisma.failleJuridique.groupBy({
        by: ["typeInfraction"],
        _count: true,
      }),
    ]);

    const stats: Record<string, number> = {};
    for (const g of grouped) {
      stats[g.statut] = g._count;
    }

    const typeStats: Record<string, number> = {};
    for (const g of byType) {
      typeStats[g.typeInfraction] = g._count;
    }

    return {
      active: stats.ACTIVE ?? 0,
      proposee: stats.PROPOSEE ?? 0,
      inactive: stats.INACTIVE ?? 0,
      byType: typeStats,
    };
  }

  /**
   * Inclusions par défaut
   */
  private getDefaultIncludes() {
    return {
      sources: {
        select: {
          id: true,
          cle: true,
          source: true,
          titre: true,
          statut: true,
        },
      },
      _count: {
        select: {
          dossiers: true,
          faillesRetenues: true,
        },
      },
    };
  }
}

// Instance singleton
export const failleJuridiqueRepository = new FailleJuridiqueRepository();
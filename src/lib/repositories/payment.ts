import { Prisma, Payment } from "@/prisma/generated-client";
import { prisma } from "@/lib/prisma";
import { IRepository, PaymentWhereInput, PaymentCreateInput, PaymentUpdateInput, FindManyOptions } from "./base";

/**
 * PaymentRepository - Couche d'accès aux données pour les paiements
 * Gère les virements, validations et remboursements
 */
export class PaymentRepository implements IRepository<Payment, Payment, PaymentCreateInput, PaymentUpdateInput, PaymentWhereInput> {
  /**
   * Trouve un paiement par son ID
   */
  async findUnique(id: string): Promise<Payment | null> {
    return prisma.payment.findUnique({
      where: { id },
      include: this.getDefaultIncludes(),
    });
  }

  /**
   * Trouve le premier paiement correspondant
   */
  async findFirst(where: PaymentWhereInput): Promise<Payment | null> {
    return prisma.payment.findFirst({
      where,
      include: this.getDefaultIncludes(),
    });
  }

  /**
   * Trouve plusieurs paiements avec pagination et filtres
   */
  async findMany(where: PaymentWhereInput, options?: FindManyOptions): Promise<Payment[]> {
    return prisma.payment.findMany({
      where,
      orderBy: options?.orderBy ?? { createdAt: "desc" },
      take: options?.take ?? 50,
      skip: options?.skip ?? 0,
      include: options?.include ?? this.getDefaultIncludes(),
    });
  }

  /**
   * Crée un nouveau paiement
   */
  async create(data: PaymentCreateInput): Promise<Payment> {
    return prisma.payment.create({
      data,
      include: this.getDefaultIncludes(),
    });
  }

  /**
   * Met à jour un paiement
   */
  async update(id: string, data: PaymentUpdateInput): Promise<Payment> {
    return prisma.payment.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: this.getDefaultIncludes(),
    });
  }

  /**
   * Supprime un paiement (soft delete)
   */
  async delete(id: string): Promise<Payment> {
    return prisma.payment.update({
      where: { id },
      data: {
        status: "REFUSED",
        refuseLe: new Date(),
        refusMotif: "Supprimé par administrateur",
        updatedAt: new Date(),
      },
      include: this.getDefaultIncludes(),
    });
  }

  /**
   * Compte les paiements
   */
  async count(where: PaymentWhereInput): Promise<number> {
    return prisma.payment.count({ where });
  }

  /**
   * Méthodes spécialisées pour l'administration
   */

  /**
   * Trouve les paiements en attente de validation
   */
  async findPendingValidation(options?: FindManyOptions): Promise<Payment[]> {
    return this.findMany(
      { status: "PENDING_VIREMENT" },
      { ...options, orderBy: { createdAt: "asc" } }
    );
  }

  /**
   * Trouve les paiements par utilisateur
   */
  async findByUserId(userId: string, options?: FindManyOptions): Promise<Payment[]> {
    return this.findMany({ userId }, options);
  }

  /**
   * Trouve les paiements par dossier
   */
  async findByDossierId(dossierId: string): Promise<Payment[]> {
    return this.findMany({ dossierId }, { orderBy: { createdAt: "desc" } });
  }

  /**
   * Valide un virement (transactionnel avec mise à jour crédits)
   */
  async validateVirement(paymentId: string, adminId: string): Promise<Payment> {
    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.update({
        where: { id: paymentId, status: "PENDING_VIREMENT" },
        data: {
          status: "PAID",
          valideLe: new Date(),
          updatedAt: new Date(),
        },
        include: this.getDefaultIncludes(),
      });

      // Incrémenter les crédits si c'est une offre AMENDE ou SUSPENSION (pas CONTENTIEUX)
      if (payment.kind !== "CONTENTIEUX") {
        await tx.user.update({
          where: { id: payment.userId },
          data: {
            credits: { increment: 1 },
            updatedAt: new Date(),
          },
        });
      }

      // Si lié à un dossier, marquer le crédit comme consommé à la validation juriste
      if (payment.dossierId) {
        await tx.dossier.update({
          where: { id: payment.dossierId },
          data: {
            creditDebite: true,
          },
        });
      }

      return payment;
    });
  }

  /**
   * Refuse un virement avec motif obligatoire
   */
  async refuseVirement(paymentId: string, motif: string, adminId: string): Promise<Payment> {
    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.update({
        where: { id: paymentId, status: "PENDING_VIREMENT" },
        data: {
          status: "REFUSED",
          refuseLe: new Date(),
          refusMotif: motif,
          updatedAt: new Date(),
        },
        include: this.getDefaultIncludes(),
      });

      // Si lié à un dossier, ajouter un événement
      if (payment.dossierId) {
        await tx.dossierEvent.create({
          data: {
            dossierId: payment.dossierId,
            type: "REJET",
            detail: `Virement refusé : ${motif}`,
          },
        });
      }

      return payment;
    });
  }

  /**
   * Marque un paiement comme remboursé (contentieux rejeté)
   */
  async markRefunded(paymentId: string): Promise<Payment> {
    return prisma.payment.update({
      where: { id: paymentId, status: "REFUND_DUE" },
      data: {
        status: "REFUNDED",
        rembourseLe: new Date(),
        updatedAt: new Date(),
      },
      include: this.getDefaultIncludes(),
    });
  }

  /**
   * Obtient les KPIs pour l'admin
   */
  async getKpis(): Promise<{
    total: number;
    pending: number;
    validated: number;
    refused: number;
    refundDue: number;
    refunded: number;
    totalAmount: number;
    pendingAmount: number;
  }> {
    const [grouped, totalAmountAgg, pendingAmountAgg] = await Promise.all([
      prisma.payment.groupBy({
        by: ["status"],
        _count: true,
      }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: { in: ["PAID", "PENDING_VIREMENT"] } },
      }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: "PENDING_VIREMENT" },
      }),
    ]);

    const stats: Record<string, number> = {};
    for (const g of grouped) {
      stats[g.status] = g._count;
    }

    return {
      total: Object.values(stats).reduce((a, b) => a + b, 0),
      pending: stats.PENDING_VIREMENT ?? 0,
      validated: stats.PAID ?? 0,
      refused: stats.REFUSED ?? 0,
      refundDue: stats.REFUND_DUE ?? 0,
      refunded: stats.REFUNDED ?? 0,
      totalAmount: Number(totalAmountAgg._sum.amount ?? 0),
      pendingAmount: Number(pendingAmountAgg._sum.amount ?? 0),
    };
  }

  /**
   * Inclusions par défaut
   */
  private getDefaultIncludes() {
    return {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          telephone: true,
          credits: true,
        },
      },
      dossier: {
        select: {
          id: true,
          type: true,
          statut: true,
          num_pv: true,
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      },
    };
  }
}

// Instance singleton
export const paymentRepository = new PaymentRepository();
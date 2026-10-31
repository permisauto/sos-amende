import { Payment } from "@/prisma/generated-client";
import { paymentRepository } from "@/lib/repositories";
import { AuditLogger } from "./audit";

type PaymentStatus = "PENDING_VIREMENT" | "PAID" | "REFUSED" | "REFUND_DUE" | "REFUNDED";

/**
 * PaymentService - Couche métier pour la gestion des paiements
 */
export class PaymentService {
  /**
   * Crée un paiement en attente de virement
   */
  static async createPendingVirement(data: {
    userId: string;
    amount: number;
    kind: "AMENDE" | "SUSPENSION" | "CONTENTIEUX";
    optionLrar?: boolean;
    dossierId?: string;
  }): Promise<Payment> {
    const payment = await paymentRepository.create({
      user: { connect: { id: data.userId } },
      amount: data.amount,
      currency: "EUR",
      status: "PENDING_VIREMENT",
      kind: data.kind,
      optionLrar: data.optionLrar ?? false,
      dossier: data.dossierId ? { connect: { id: data.dossierId } } : undefined,
    });

    await AuditLogger.logCreate(data.userId, "Payment", payment.id, {
      amount: data.amount,
      kind: data.kind,
      optionLrar: data.optionLrar,
      dossierId: data.dossierId,
    });

    return payment;
  }

  /**
   * Ajoute la preuve de virement
   */
  static async addProof(paymentId: string, userId: string, data: {
    preuveUrl: string;
    preuveNom: string;
  }): Promise<Payment> {
    const payment = await paymentRepository.update(paymentId, {
      preuveUrl: data.preuveUrl,
      preuveNom: data.preuveNom,
      preuveUploadedAt: new Date(),
    });

    await AuditLogger.logBusinessEvent(userId, "PROOF_UPLOADED", "Payment", paymentId, data);

    return payment;
  }

  /**
   * Valide un virement (admin)
   */
  static async validateVirement(paymentId: string, adminId: string): Promise<Payment> {
    const payment = await paymentRepository.validateVirement(paymentId, adminId);

    await AuditLogger.logBusinessEvent(adminId, "VIRMENT_VALIDATED", "Payment", paymentId, {
      userId: payment.userId,
      amount: Number(payment.amount),
      kind: payment.kind,
    });

    return payment;
  }

  /**
   * Refuse un virement (admin)
   */
  static async refuseVirement(paymentId: string, adminId: string, motif: string): Promise<Payment> {
    const payment = await paymentRepository.refuseVirement(paymentId, motif, adminId);

    await AuditLogger.logBusinessEvent(adminId, "VIRMENT_REFUSED", "Payment", paymentId, {
      userId: payment.userId,
      motif,
    });

    return payment;
  }

  /**
   * Marque un contentieux comme remboursé (après rejet dossier)
   */
  static async markContentieuxRefunded(paymentId: string, adminId: string): Promise<Payment> {
    const payment = await paymentRepository.markRefunded(paymentId);

    await AuditLogger.logBusinessEvent(adminId, "CONTENTIEUX_REFUNDED", "Payment", paymentId, {
      userId: payment.userId,
      amount: Number(payment.amount),
    });

    return payment;
  }

  /**
   * Récupère les paiements pour l'admin avec filtres
   */
  static async getPaymentsForAdmin(filters?: {
    status?: PaymentStatus | "ALL";
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ payments: Payment[]; total: number }> {
    const where: Record<string, unknown> = {};
    
    if (filters?.status && filters.status !== "ALL") {
      where.status = filters.status;
    }
    
    if (filters?.search) {
      where.OR = [
        { user: { email: { contains: filters.search, mode: "insensitive" } } },
        { user: { name: { contains: filters.search, mode: "insensitive" } } },
        { user: { telephone: { contains: filters.search } } },
      ];
    }

    const [payments, total] = await Promise.all([
      paymentRepository.findMany(where, {
        take: filters?.limit ?? 50,
        skip: ((filters?.page ?? 1) - 1) * (filters?.limit ?? 50),
        orderBy: { createdAt: "desc" },
      }),
      paymentRepository.count(where),
    ]);

    return { payments, total };
  }

  /**
   * Récupère les KPIs pour l'admin
   */
  static async getKpis(): Promise<{
    total: number;
    pending: number;
    validated: number;
    refused: number;
    refundDue: number;
    refunded: number;
    totalAmount: number;
    pendingAmount: number;
  }> {
    return paymentRepository.getKpis();
  }

  /**
   * Récupère les paiements d'un utilisateur
   */
  static async getUserPayments(userId: string): Promise<Payment[]> {
    return paymentRepository.findByUserId(userId);
  }

  /**
   * Récupère le paiement lié à un dossier
   */
  static async getPaymentByDossier(dossierId: string): Promise<Payment | null> {
    return paymentRepository.findFirst({ dossierId });
  }
}
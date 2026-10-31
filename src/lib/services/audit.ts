import { prisma } from "@/lib/prisma";

export interface AuditLogEntry {
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * AuditLogger - Journalisation centralisée pour traçabilité et conformité
 * Tous les accès aux données sensibles sont tracés
 */
export class AuditLogger {
  /**
   * Enregistre une entrée d'audit
   */
  static async log(entry: AuditLogEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: entry.userId,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
          metadata: entry.metadata ? JSON.parse(JSON.stringify(entry.metadata)) : null,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      // Ne jamais faire échouer l'opération principale
      console.error("[AUDIT] Échec écriture log:", error);
    }
  }

  /**
   * Enregistre un accès en lecture
   */
  static async logRead(userId: string, resource: string, resourceId: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.log({
      userId,
      action: "READ",
      resource,
      resourceId,
      metadata,
    });
  }

  /**
   * Enregistre une création
   */
  static async logCreate(userId: string, resource: string, resourceId: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.log({
      userId,
      action: "CREATE",
      resource,
      resourceId,
      metadata,
    });
  }

  /**
   * Enregistre une modification
   */
  static async logUpdate(userId: string, resource: string, resourceId: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.log({
      userId,
      action: "UPDATE",
      resource,
      resourceId,
      metadata,
    });
  }

  /**
   * Enregistre une suppression
   */
  static async logDelete(userId: string, resource: string, resourceId: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.log({
      userId,
      action: "DELETE",
      resource,
      resourceId,
      metadata,
    });
  }

  /**
   * Enregistre un événement métier
   */
  static async logBusinessEvent(userId: string, event: string, resource: string, resourceId: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.log({
      userId,
      action: event,
      resource,
      resourceId,
      metadata,
    });
  }

  /**
   * Récupère les logs d'audit pour une ressource
   */
  static async getLogsForResource(resource: string, resourceId: string, limit = 100): Promise<unknown[]> {
    return prisma.auditLog.findMany({
      where: { resource, resourceId },
      orderBy: { timestamp: "desc" },
      take: limit,
    });
  }

  /**
   * Récupère les logs d'audit pour un utilisateur
   */
  static async getLogsForUser(userId: string, limit = 100): Promise<unknown[]> {
    return prisma.auditLog.findMany({
      where: { userId },
      orderBy: { timestamp: "desc" },
      take: limit,
    });
  }
}
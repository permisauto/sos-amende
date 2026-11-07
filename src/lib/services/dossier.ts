import { Dossier, DossierStatut, DossierType, Prisma } from "@/prisma/generated-client";
import { dossierRepository } from "@/lib/repositories";
import { AuditLogger } from "./audit";

/**
 * DossierService - Couche métier pour la gestion des dossiers
 * Orchestre les repositories et applique la logique métier
 */
export class DossierService {
  /**
   * Crée un nouveau dossier après analyse OCR
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

    // Log d'audit
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
   * Met à jour un dossier après analyse (OCR + détection failles)
   */
  static async updateAfterAnalyse(dossierId: string, data: {
    extractedData: Prisma.JsonObject;
    pvTexte?: string;
    lettreGeneree?: string;
    failleJuridiqueId?: string;
    dateLimite?: Date;
    voieProcedure?: string;
    classeContravention?: number;
    consignationMontant?: number;
    statut: DossierStatut;
  }, userId: string, userRole: string): Promise<Dossier> {
    const dossier = await dossierRepository.update(dossierId, data, userId, userRole);

    await AuditLogger.log({
      userId,
      action: "ANALYSE",
      resource: "Dossier",
      resourceId: dossierId,
      metadata: { 
        newStatut: data.statut,
        failleId: data.failleJuridiqueId,
      },
    });

    return dossier;
  }

  /**
   * Valide un dossier par le juriste (passe en PRET)
   */
  static async validerParJuriste(
    dossierId: string,
    juristeId: string,
    data: {
      lettreGeneree: string;
      refereGenere?: string;
      canalEnvoi: "ANTAI" | "TELERECOURS" | "LRAR";
      motifsRejet?: string;
    }
  ): Promise<Dossier> {
    await dossierRepository.updateStatutWithEvent(
      dossierId,
      "PRET",
      "VALIDATION",
      `Lettre validée par le juriste. Canal: ${data.canalEnvoi}`,
      juristeId,
      "JURISTE"
    );

    // Mise à jour des champs spécifiques
    const dossierMisAJour = await dossierRepository.update(dossierId, {
      lettreGeneree: data.lettreGeneree,
      refereGenere: data.refereGenere,
      canalEnvoi: data.canalEnvoi,
      valideLe: new Date(),
    }, juristeId, "JURISTE");

    await AuditLogger.log({
      userId: juristeId,
      action: "VALIDATE",
      resource: "Dossier",
      resourceId: dossierId,
      metadata: { canal: data.canalEnvoi },
    });

    return dossierMisAJour;
  }

  /**
   * Rejette un dossier par le juriste
   */
  static async rejeterParJuriste(
    dossierId: string,
    juristeId: string,
    motifRejet: string
  ): Promise<Dossier> {
    await dossierRepository.updateStatutWithEvent(
      dossierId,
      "REJETE",
      "REJET",
      motifRejet,
      juristeId,
      "JURISTE"
    );

    const dossierMisAJour = await dossierRepository.update(dossierId, {
      motifRejet,
      statut: "REJETE",
    }, juristeId, "JURISTE");

    await AuditLogger.log({
      userId: juristeId,
      action: "REJECT",
      resource: "Dossier",
      resourceId: dossierId,
      metadata: { motif: motifRejet },
    });

    return dossierMisAJour;
  }

  /**
   * Envoie un dossier (passe en ENVOYE)
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
    await dossierRepository.updateStatutWithEvent(
      dossierId,
      "ENVOYE",
      "ENVOI",
      `Envoyé via ${data.canalEnvoi}. N° dépôt: ${data.numeroDepot}`,
      juristeId,
      "JURISTE"
    );

    const dossierMisAJour = await dossierRepository.update(dossierId, {
      numeroDepot: data.numeroDepot,
      canalEnvoi: data.canalEnvoi,
      decisionAttendueLe: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // 21 jours
    }, juristeId, "JURISTE");

    await AuditLogger.log({
      userId: juristeId,
      action: "SEND",
      resource: "Dossier",
      resourceId: dossierId,
      metadata: { canal: data.canalEnvoi, numeroDepot: data.numeroDepot },
    });

    return dossierMisAJour;
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
   * Retourne un dossier en analyse
   */
  static async retournerEnAnalyse(
    dossierId: string,
    juristeId: string,
    motif: string
  ): Promise<Dossier> {
    const dossier = await dossierRepository.updateStatutWithEvent(
      dossierId,
      "EN_ANALYSE",
      "RETOUR",
      `Retour en analyse: ${motif}`,
      juristeId,
      "JURISTE"
    );

    await dossierRepository.update(dossierId, {
      statut: "EN_ANALYSE",
    }, juristeId, "JURISTE");

    await AuditLogger.log({
      userId: juristeId,
      action: "RETURN_TO_ANALYSE",
      resource: "Dossier",
      resourceId: dossierId,
      metadata: { motif },
    });

    return dossier;
  }

  /**
   * Récupère les dossiers pour le dashboard juriste
   */
  static async getDossiersPourJuriste(
    juristeId: string,
    filters?: { statut?: DossierStatut | DossierStatut[]; limit?: number }
  ): Promise<Dossier[]> {
    const where: Prisma.DossierWhereInput = {};
    
    if (filters?.statut) {
      where.statut = Array.isArray(filters.statut) 
        ? { in: filters.statut } 
        : filters.statut;
    }

    return dossierRepository.findByStatutForJuriste(
      where.statut as DossierStatut | DossierStatut[] ?? "ALL",
      { take: filters?.limit ?? 100 }
    );
  }

  /**
   * Récupère les dossiers d'un client
   */
  static async getDossiersClient(userId: string, options?: { limit?: number }): Promise<Dossier[]> {
    return dossierRepository.findByUserId(userId, { take: options?.limit ?? 50 });
  }

  /**
   * Récupère les statistiques pour un juriste
   */
  static async getStatsJuriste(): Promise<Record<string, number>> {
    return dossierRepository.getStatsByStatut();
  }

  /**
   * Récupère les statistiques pour un client
   */
  static async getStatsClient(userId: string): Promise<{
    total: number;
    enCours: number;
    envoyes: number;
    resolus: number;
    rejetes: number;
  }> {
    const stats = await dossierRepository.getStatsByStatut(userId, "CLIENT");
    
    return {
      total: Object.values(stats).reduce((a, b) => a + b, 0),
      enCours: (stats.EN_ANALYSE ?? 0) + (stats.EN_ATTENTE_VALIDATION ?? 0) + 
               (stats.A_VERIFIER ?? 0) + (stats.PRET ?? 0) + (stats.EN_ATTENTE_PRE_SIGNATURE ?? 0),
      envoyes: stats.ENVOYE ?? 0,
      resolus: stats.RESOLU ?? 0,
      rejetes: stats.REJETE ?? 0,
    };
  }

  /**
   * Vérifie l'accès à un dossier
   */
  static async checkAccess(dossierId: string, userId: string, userRole: string): Promise<boolean> {
    if (userRole === "ADMIN") return true;
    
    const dossier = await dossierRepository.findUnique(dossierId, userId, userRole);
    return !!dossier;
  }
}
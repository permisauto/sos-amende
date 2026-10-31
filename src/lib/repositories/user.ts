import { Prisma, User, Role } from "@/prisma/generated-client";
import { prisma } from "@/lib/prisma";
import { IRepository, UserWhereInput, UserCreateInput, UserUpdateInput, FindManyOptions } from "./base";

/**
 * Type pour utilisateur public (sans champs sensibles)
 */
export type PublicUser = Pick<User, "id" | "name" | "email" | "role" | "credits" | "signatureUrl" | "telephone" | "createdAt" | "updatedAt">;

/**
 * Type pour utilisateur complet (avec hash pour auth)
 */
export type FullUser = Pick<User, "id" | "name" | "email" | "role" | "credits" | "signatureUrl" | "telephone" | "passwordHash" | "emailVerified" | "image" | "createdAt" | "updatedAt">;

/**
 * UserRepository - Couche d'accès aux données pour les utilisateurs
 * Gère l'authentification, les rôles et les crédits
 */
export class UserRepository implements IRepository<User, PublicUser, UserCreateInput, UserUpdateInput, UserWhereInput> {
  /**
   * Trouve un utilisateur par son ID
   */
  async findUnique(id: string): Promise<PublicUser | null> {
    return prisma.user.findUnique({
      where: { id },
      select: this.getPublicSelect(),
    }) as Promise<PublicUser | null>;
  }

  /**
   * Trouve un utilisateur par email
   */
  async findByEmail(email: string): Promise<FullUser | null> {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: this.getFullSelect(),
    }) as Promise<FullUser | null>;
  }

  /**
   * Trouve le premier utilisateur correspondant
   */
  async findFirst(where: UserWhereInput): Promise<PublicUser | null> {
    return prisma.user.findFirst({
      where,
      select: this.getFullSelect(),
    }) as Promise<PublicUser | null>;
  }

  /**
   * Trouve plusieurs utilisateurs avec pagination
   */
  async findMany(where: UserWhereInput, options?: FindManyOptions): Promise<PublicUser[]> {
    return prisma.user.findMany({
      where,
      orderBy: options?.orderBy ?? { createdAt: "desc" },
      take: options?.take ?? 50,
      skip: options?.skip ?? 0,
      select: options?.select ?? this.getPublicSelect(),
    }) as Promise<PublicUser[]>;
  }

  /**
   * Crée un nouvel utilisateur
   */
  async create(data: UserCreateInput): Promise<FullUser> {
    return prisma.user.create({
      data,
      select: this.getFullSelect(),
    }) as Promise<FullUser>;
  }

  /**
   * Met à jour un utilisateur
   */
  async update(id: string, data: UserUpdateInput): Promise<FullUser> {
    return prisma.user.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      select: this.getFullSelect(),
    }) as Promise<FullUser>;
  }

  /**
   * Supprime un utilisateur
   */
  async delete(id: string): Promise<FullUser> {
    return prisma.user.delete({
      where: { id },
      select: this.getFullSelect(),
    }) as Promise<FullUser>;
  }

  /**
   * Compte les utilisateurs
   */
  async count(where: UserWhereInput): Promise<number> {
    return prisma.user.count({ where });
  }

  /**
   * Méthodes spécialisées
   */

  /**
   * Trouve les juristes et admins
   */
  async findJuristesAndAdmins(): Promise<PublicUser[]> {
    return prisma.user.findMany({
      where: {
        role: { in: ["JURISTE", "ADMIN"] },
      },
      select: this.getPublicSelect(),
      orderBy: { name: "asc" },
    }) as Promise<PublicUser[]>;
  }

  /**
   * Trouve les clients avec crédits
   */
  async findClientsWithCredits(minCredits = 1): Promise<PublicUser[]> {
    return prisma.user.findMany({
      where: {
        role: "CLIENT",
        credits: { gte: minCredits },
      },
      select: this.getPublicSelect(),
      orderBy: { createdAt: "desc" },
    }) as Promise<PublicUser[]>;
  }

  /**
   * Incrémente les crédits d'un utilisateur
   */
  async incrementCredits(userId: string, amount: number): Promise<FullUser> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        credits: { increment: amount },
        updatedAt: new Date(),
      },
      select: this.getFullSelect(),
    }) as Promise<FullUser>;
  }

  /**
   * Décrémente les crédits d'un utilisateur (avec vérification)
   */
  async decrementCredits(userId: string, amount: number): Promise<FullUser | null> {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });
      
      if (!user || user.credits < amount) {
        return null;
      }
      
      return tx.user.update({
        where: { id: userId },
        data: {
          credits: { decrement: amount },
          updatedAt: new Date(),
        },
        select: this.getFullSelect(),
      }) as Promise<FullUser>;
    });
  }

  /**
   * Met à jour le hash du mot de passe
   */
  async updatePasswordHash(userId: string, passwordHash: string): Promise<FullUser> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        updatedAt: new Date(),
      },
      select: this.getFullSelect(),
    }) as Promise<FullUser>;
  }

  /**
   * Met à jour l'URL de signature
   */
  async updateSignatureUrl(userId: string, signatureUrl: string): Promise<FullUser> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        signatureUrl,
        updatedAt: new Date(),
      },
      select: this.getFullSelect(),
    }) as Promise<FullUser>;
  }

  /**
   * Met à jour le téléphone
   */
  async updateTelephone(userId: string, telephone: string): Promise<FullUser> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        telephone,
        updatedAt: new Date(),
      },
      select: this.getFullSelect(),
    }) as Promise<FullUser>;
  }

  /**
   * Sélection publique (sans données sensibles)
   */
  private getPublicSelect() {
    return {
      id: true,
      name: true,
      email: true,
      role: true,
      credits: true,
      signatureUrl: true,
      telephone: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  /**
   * Sélection complète (avec passwordHash pour auth)
   */
  private getFullSelect() {
    return {
      ...this.getPublicSelect(),
      passwordHash: true,
      emailVerified: true,
      image: true,
    };
  }
}

// Instance singleton
export const userRepository = new UserRepository();
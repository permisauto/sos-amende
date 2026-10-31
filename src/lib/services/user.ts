import { User, Role } from "@/prisma/generated-client";
import { userRepository, PublicUser, FullUser } from "@/lib/repositories";
import { AuditLogger } from "./audit";

/**
 * UserService - Couche métier pour la gestion des utilisateurs
 */
export class UserService {
  /**
   * Trouve un utilisateur par ID (public)
   */
  static async findById(userId: string): Promise<PublicUser | null> {
    return userRepository.findUnique(userId);
  }

  /**
   * Trouve un utilisateur par email (avec hash pour auth)
   */
  static async findByEmail(email: string): Promise<FullUser | null> {
    return userRepository.findByEmail(email);
  }

  /**
   * Crée un nouvel utilisateur (inscription)
   */
  static async createUser(data: {
    email: string;
    name: string;
    role?: Role;
    passwordHash?: string;
    telephone?: string;
  }): Promise<FullUser> {
    const user = await userRepository.create({
      email: data.email.toLowerCase(),
      name: data.name,
      role: data.role ?? "CLIENT",
      passwordHash: data.passwordHash,
      telephone: data.telephone,
      credits: 0,
    });

    await AuditLogger.logCreate(user.id, "User", user.id, { email: data.email, role: data.role });

    return user;
  }

  /**
   * Met à jour le profil utilisateur
   */
  static async updateProfile(userId: string, data: {
    name?: string;
    telephone?: string;
    signatureUrl?: string;
  }): Promise<User> {
    const user = await userRepository.update(userId, data);

    await AuditLogger.logUpdate(userId, "User", userId, data);

    return user;
  }

  /**
   * Change le mot de passe
   */
  static async changePassword(userId: string, newPasswordHash: string): Promise<User> {
    const user = await userRepository.updatePasswordHash(userId, newPasswordHash);

    await AuditLogger.logBusinessEvent(userId, "PASSWORD_CHANGE", "User", userId);

    return user;
  }

  /**
   * Incrémente les crédits (après validation virement)
   */
  static async addCredits(userId: string, amount: number, reason: string): Promise<User> {
    const user = await userRepository.incrementCredits(userId, amount);

    await AuditLogger.logBusinessEvent(userId, "CREDITS_ADDED", "User", userId, { amount, reason });

    return user;
  }

  /**
   * Décrémente les crédits (après analyse)
   */
  static async useCredit(userId: string, amount: number, reason: string): Promise<User | null> {
    const user = await userRepository.decrementCredits(userId, amount);

    if (user) {
      await AuditLogger.logBusinessEvent(userId, "CREDITS_USED", "User", userId, { amount, reason });
    }

    return user;
  }

  /**
   * Récupère les juristes et admins
   */
  static async getJuristesAndAdmins(): Promise<PublicUser[]> {
    return userRepository.findJuristesAndAdmins();
  }

  /**
   * Vérifie si un utilisateur a un rôle donné
   */
  static async hasRole(userId: string, roles: Role[]): Promise<boolean> {
    const user = await userRepository.findUnique(userId);
    return user ? roles.includes(user.role) : false;
  }
}
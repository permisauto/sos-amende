import { Prisma } from "@/prisma/generated-client";

/**
 * Interface de base pour tous les repositories
 * Définit le contrat CRUD standardisé
 * TRead = type de lecture (peut être partiel), T = type complet
 */
export interface IRepository<T, TRead, TCreate, TUpdate, TWhere> {
  findUnique(id: string): Promise<TRead | null>;
  findFirst(where: TWhere): Promise<TRead | null>;
  findMany(where: TWhere, options?: FindManyOptions): Promise<TRead[]>;
  create(data: TCreate): Promise<T>;
  update(id: string, data: TUpdate): Promise<T>;
  delete(id: string): Promise<T>;
  count(where: TWhere): Promise<number>;
}

export interface FindManyOptions {
  orderBy?: Record<string, "asc" | "desc">;
  take?: number;
  skip?: number;
  select?: Record<string, boolean>;
  include?: Record<string, boolean>;
}

/**
 * Types pour les opérations de base de données
 */
export type DossierWhereInput = Prisma.DossierWhereInput;
export type DossierCreateInput = Prisma.DossierCreateInput;
export type DossierUpdateInput = Prisma.DossierUpdateInput;
export type UserWhereInput = Prisma.UserWhereInput;
export type UserCreateInput = Prisma.UserCreateInput;
export type UserUpdateInput = Prisma.UserUpdateInput;
export type PaymentWhereInput = Prisma.PaymentWhereInput;
export type PaymentCreateInput = Prisma.PaymentCreateInput;
export type PaymentUpdateInput = Prisma.PaymentUpdateInput;
export type FailleJuridiqueWhereInput = Prisma.FailleJuridiqueWhereInput;
export type PreuveWhereInput = Prisma.PreuveWhereInput;
export type MessageWhereInput = Prisma.MessageWhereInput;
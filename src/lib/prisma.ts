import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      // Repli sur DIRECT_URL : si DATABASE_URL est absente/invalide (ex. config
      // d'un environnement de prévisualisation incomplet), on se connecte quand
      // même via l'URL directe qui, elle, fonctionne pour les requêtes comme
      // pour les migrations. Jamais d'erreur « DATABASE_URL manquante » au boot.
      connectionString:
        process.env.DATABASE_URL ?? process.env.DIRECT_URL,
    }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

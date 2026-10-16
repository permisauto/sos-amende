import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { SUPABASE_POOLER_CA } from "@/lib/supabase-pooler-ca";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Repli sur DIRECT_URL : si DATABASE_URL est absente/invalide (ex. config
// d'un environnement de prévisualisation incomplet), on se connecte quand
// même via l'URL directe qui, elle, fonctionne pour les requêtes comme
// pour les migrations. Jamais d'erreur « DATABASE_URL manquante » au boot.
const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;

// Le pooler Supabase signe ses certificats avec une racine propre ("Supabase
// Root 2021 CA") absente du magasin de confiance Node. Les versions récentes
// de `pg` traitent sslmode=require comme verify-full → connexion refusée
// ("self-signed certificate in certificate chain"), ce qui cassait le login
// en prod/preview. On injecte la racine comme ancre de confiance (connexion
// chiffrée ET vérifiée). Localhost (pas de TLS) : aucun réglage forcé.
const estSupabase = /supabase\.(com|co)/.test(connectionString ?? "");

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      ...(estSupabase
        ? { ssl: { ca: SUPABASE_POOLER_CA, rejectUnauthorized: true } }
        : {}),
    }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

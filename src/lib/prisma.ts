import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/prisma/generated-client";
import { SUPABASE_POOLER_CA } from "@/lib/supabase-pooler-ca";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Repli sur DIRECT_URL : si DATABASE_URL est absente/invalide (ex. config
// d'un environnement de prévisualisation incomplet), on se connecte quand
// même via l'URL directe qui, elle, fonctionne pour les requêtes comme
// pour les migrations. Jamais d'erreur « DATABASE_URL manquante » au boot.
const urlBrute = process.env.DATABASE_URL ?? process.env.DIRECT_URL;

// Le pooler Supabase signe ses certificats avec une racine propre ("Supabase
// Root 2021 CA") absente du magasin de confiance Node. Les versions récentes
// de `pg` traitent sslmode=require comme verify-full → connexion refusée
// ("self-signed certificate in certificate chain"), ce qui cassait le login
// en prod/preview.
//
// Piège pg : `Object.assign({}, config, parse(connectionString))` — la clé
// `ssl` produite par le `sslmode=` de l'URL **écrase** l'objet `ssl` explicite
// passé à côté. Il faut donc retirer le `sslmode` de l'URL pour que notre
// certificat (ancre de confiance) survive. On active alors le TLS en passant
// `ssl` explicitement (chiffrement + vérification, pas de rejet aveugle).
const estSupabase = /supabase\.(com|co)/.test(urlBrute ?? "");

function retirerSslmode(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete("sslmode");
    return u.toString();
  } catch {
    return url.replace(/([?&])sslmode=[^&]*&?/g, "$1").replace(/[?&]$/, "");
  }
}

const connectionString = estSupabase && urlBrute ? retirerSslmode(urlBrute) : urlBrute;

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

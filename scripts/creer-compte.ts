import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "../src/generated/prisma/client";

/**
 * Provisionnement d'un compte interne (JURISTE ou ADMIN) sur la base pointée
 * par DATABASE_URL. Usage :
 *
 *   npx tsx scripts/creer-compte.ts "email@domaine.fr" "Role" "Nom du compte"
 *
 * Exemples :
 *   npx tsx scripts/creer-compte.ts si.allou@gmail.com ADMIN "Super Admin"
 *   npx tsx scripts/creer-compte.ts juriste@domaine.fr JURISTE "Marie Dupont"
 *
 * Le compte est créé (ou mis à jour) puis un e-mail de bienvenue avec le lien
 * de connexion magic-link est envoyé (via notifierCompteCree).
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const roleRaw = process.argv[3]?.trim().toUpperCase() as Role | undefined;
  const name = process.argv[4]?.trim() ?? email;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("Usage : npx tsx scripts/creer-compte.ts <email> <ADMIN|JURISTE> <nom>");
    process.exit(1);
  }
  if (roleRaw !== "ADMIN" && roleRaw !== "JURISTE") {
    console.error("Rôle invalide : choisir ADMIN ou JURISTE.");
    process.exit(1);
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: roleRaw, name },
    create: { email, name, role: roleRaw, credits: 0 },
  });

  console.log(`Compte ${user.role} prêt : ${user.email} (${user.name})`);

  const { notifierCompteCree } = await import("../src/lib/notifications");
  const sent = await notifierCompteCree(user.email, user.role, user.name);
  console.log(sent ? "E-mail de bienvenue envoyé." : "Envoi disabled (AUTH_RESEND_KEY absente) : compte créé localement.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
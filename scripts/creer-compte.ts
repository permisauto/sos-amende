import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

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
 * Le compte est créé (ou mis à jour), un mot de passe est défini si fourni en
 * ligne de commande (5e argument) ou demandé de façon interactive (saisie
 * silencieuse) — haché en scrypt avant stockage. L'e-mail de bienvenue avec le
 * lien de connexion magic-link est ensuite envoyé (via notifierCompteCree).
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function lireMotDePasseInteractif(): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const motDePasse = await rl.question("Mot de passe (min 8 caractères) : ");
    return motDePasse.trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const roleRaw = process.argv[3]?.trim().toUpperCase() as Role | undefined;
  const name = process.argv[4]?.trim() ?? email;
  let motDePasse = process.argv[5]?.trim() ?? "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("Usage : npx tsx scripts/creer-compte.ts <email> <ADMIN|JURISTE> <nom> [motDePasse]");
    process.exit(1);
  }
  if (roleRaw !== "ADMIN" && roleRaw !== "JURISTE") {
    console.error("Rôle invalide : choisir ADMIN ou JURISTE.");
    process.exit(1);
  }

  if (!motDePasse) motDePasse = await lireMotDePasseInteractif();
  if (motDePasse.length < 8) {
    console.error("Le mot de passe doit contenir au moins 8 caractères.");
    process.exit(1);
  }
  const passwordHash = hashPassword(motDePasse);
  motDePasse = "";

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: roleRaw, name, passwordHash },
    create: { email, name, role: roleRaw, credits: 0, passwordHash },
  });

  console.log(`Compte ${user.role} prêt : ${user.email} (${user.name}) — connexion par mot de passe activée.`);

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
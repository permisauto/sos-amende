/**
 * Commande de build Vercel (`vercel-build`).
 *
 * Vercel exécute ce script à chaque déploiement — Production *et* Preview —
 * et `DATABASE_URL` pointe dans les deux cas sur la base Supabase de prod.
 * Le garde-fou ci-dessous limite donc `prisma migrate deploy` au déploiement
 * Production : une branche de travail qui contient une migration ne peut plus
 * modifier le schéma de prod depuis une Preview (règle « Migrations &
 * Environnements » dans AGENTS.md).
 *
 * Sortie non nulle du sous-processus = arrêt immédiat (migrations, puis build).
 */
import { spawnSync } from "node:child_process";

const estProduction = process.env.VERCEL_ENV === "production";
console.log(
  `[vercel-build] VERCEL_ENV=${process.env.VERCEL_ENV || "(vide)"} — ` +
    (estProduction
      ? "prisma migrate deploy puis next build"
      : "hors Production : migration ignorée, next build seul"),
);

function lancer(commande) {
  // Chaîne unique (jamais args + shell) : Node déprécie le mix des deux.
  const r = spawnSync(commande, { stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (estProduction) lancer("prisma migrate deploy");
lancer("next build");

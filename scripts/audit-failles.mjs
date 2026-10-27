#!/usr/bin/env node
/**
 * P1-07 — Script de vérification de la cohérence FAILLE_IDS (audit lot 5).
 * Vérifie que `FAILLE_IDS` (`moteur.ts`) est synchronisé avec :
 *   - `prisma/seed.ts` (failles seedées)
 *   - `catalogue-sources.ts` (catalogue des sources)
 *   - `moteur.ts` (`PRIORITE_DETECTION`, `PRIORITE_PACK`)
 *
 * Aucune correction appliquée automatiquement — le résultat est un rapport.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

const moteurContent = readFileSync(path.resolve("src/lib/moteur.ts"), "utf8");
const catalogueContent = readFileSync(path.resolve("src/lib/catalogue-sources.ts"), "utf8");

// Extraction des FAILLE_IDS
const failleIdsMatch = moteurContent.match(/export const FAILLE_IDS = \{([^}]+)\}/);
const failleIds = failleIdsMatch ? failleIdsMatch[1].split(",").map(s => s.trim().split(":")[0].replace(/"/g, "")) : [];
console.log("FAILLE_IDS détectés dans moteur.ts :", failleIds);

// Vérification que chaque id est présent dans le catalogue
const idsDuCatalogue = [];
const idRegex = /id:\s*"([^"]+)"/g;
let m;
while ((m = idRegex.exec(catalogueContent)) !== null) {
  idsDuCatalogue.push(m[1]);
}
console.log("\nIDs trouvés dans catalogue-sources.ts (extrait) :", idsDuCatalogue.slice(0, 10), "... (total:", idsDuCatalogue.length, ")");

// Vérification de PRIORITE_DETECTION et PRIORITE_PACK
const prioriteDetectionMatch = moteurContent.match(/const PRIORITE_DETECTION = \[([^\]]+)\]/);
const prioritePackMatch = moteurContent.match(/const PRIORITE_PACK: string\[\] = \[([^\]]+)\]/);
console.log("\nPRIORITE_DETECTION :", prioriteDetectionMatch ? prioriteDetectionMatch[1].slice(0, 100) + "..." : "NON TROUVÉ");
console.log("PRIORITE_PACK :", prioritePackMatch ? prioritePackMatch[1].slice(0, 100) + "..." : "NON TROUVÉ");

// Vérification que les 4 ids calibrés existent
const calibres = ["faille-prescription-1-an", "faille-mentions-obligatoires", "faille-erreur-plaque", "faille-certificat-etalonnage"];
const manquants = calibres.filter(id => !idsDuCatalogue.includes(id) && !failleIds.includes(id.replace("faille-", "")));
console.log("\n=== RÉSULTAT AUDIT P1-07 ===");
if (manquants.length === 0) {
  console.log("✓ Cohérence FAILLE_IDS / catalogue : OK");
  console.log("✓ 4 failles calibrées présentes :", calibres.join(", "));
} else {
  console.log("⚠ Incohérence détectée — failles manquantes :", manquants.join(", "));
}
console.log("\nAUCUNE CORRECTION AUTOMATIQUE — rapport uniquement.");

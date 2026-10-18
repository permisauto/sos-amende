import { prisma } from "@/lib/prisma";

/**
 * Quota Gemini : compteur d'appels par jour (palier gratuit).
 *
 * Sans ce garde-fou, un lot de 40 extractions épuise le quota en un passage :
 * toutes les analyses suivantes retombent alors sur le secours local (sans
 * IA). On lit le quota restant avant un lot, et chaque appel HTTP l'incrémente.
 */

/** Plafond d'appels Gemini par jour (palier gratuit). Surchargeable par env. */
export function quotaJournalier(): number {
  const n = Number.parseInt(process.env.GEMINI_QUOTA_JOUR ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

/**
 * Part maximale du quota quotidien réservée à l'**extraction des nouvelles
 * sources** ; le reste est laissé à la régénération des analyses héritées (et
 * aux appels ponctuels « Vérifier les failles »). Défaut : 5.
 */
export function partExtractionJournaliere(): number {
  const n = Number.parseInt(process.env.GEMINI_PART_EXTRACTION ?? "", 10);
  if (Number.isFinite(n) && n >= 0) return n;
  return 5;
}

/** Date du jour (UTC) au format `YYYY-MM-DD` — clé du compteur. */
export function jourCourant(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Appels Gemini déjà comptés aujourd'hui. */
export async function appelsGeminiAujourdhui(): Promise<number> {
  try {
    const row = await prisma.geminiUsage.findUnique({
      where: { jour: jourCourant() },
    });
    return row?.appels ?? 0;
  } catch {
    // Lecture impossible : on se suppose à quota plein (garde-fou strict — un
    // lot non lancé vaut mieux qu'un dépassement de quota).
    return quotaJournalier();
  }
}

/** Incrémente le compteur du jour — best-effort, ne lève jamais. */
export async function enregistrerAppelGemini(n = 1): Promise<void> {
  const jour = jourCourant();
  try {
    await prisma.geminiUsage.upsert({
      where: { jour },
      create: { jour, appels: n },
      update: { appels: { increment: n } },
    });
  } catch {
    /* compteur best-effort : ne jamais faire échouer un appel IA */
  }
}

/** Appels Gemini encore disponibles aujourd'hui (jamais négatif). */
export async function quotaGeminiRestant(): Promise<number> {
  return Math.max(0, quotaJournalier() - (await appelsGeminiAujourdhui()));
}

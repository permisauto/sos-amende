"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import { Prisma } from "@/generated/prisma/client";
import type { RegleDetection } from "@/lib/moteur";
import type { JurisprudenceRef } from "@/lib/catalogue-sources";
import { synchroniserCatalogue } from "@/lib/auto-alimentation";
import { validateMockFaille } from "@/lib/mock-failles";

export type FailleState =
  | { error?: string; ok?: boolean; count?: number }
  | undefined;

const regleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("champAbsent"), champ: z.string().min(1) }),
  z.object({ type: z.literal("datePrescrite") }),
  z.object({ type: z.literal("plaqueIncorrecte") }),
  z.object({ type: z.literal("etalonnageExpire") }),
  z.object({ type: z.literal("texteContient"), motif: z.string().min(1) }),
  z.object({ type: z.literal("texteAbsent"), motif: z.string().min(1) }),
]);

const jurisprudenceSchema = z.object({
  reference: z.string().min(1),
  juridiction: z.string().min(1),
  date: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  verifiee: z.boolean().default(false),
  resume: z.string().optional().nullable(),
});

// Lit les règles de détection depuis le textarea JSON du formulaire admin.
function lireRegles(formData: FormData):
  | { regles: RegleDetection[] }
  | { error: string } {
  const raw = String(formData.get("reglesDetection") ?? "").trim();
  if (!raw) return { regles: [] };
  try {
    const parsed = JSON.parse(raw);
    const checked = z.array(regleSchema).safeParse(parsed);
    if (!checked.success) {
      return { error: "Règles de détection invalides (voir le format attendu)." };
    }
    return { regles: checked.data };
  } catch {
    return { error: "Règles de détection : JSON invalide." };
  }
}

// Lit les références de jurisprudence (JSON) depuis le formulaire admin.
function lireJurisprudence(formData: FormData):
  | { jurisprudence: JurisprudenceRef[] }
  | { error: string } {
  const raw = String(formData.get("jurisprudence") ?? "").trim();
  if (!raw) return { jurisprudence: [] };
  try {
    const parsed = JSON.parse(raw);
    const checked = z.array(jurisprudenceSchema).safeParse(parsed);
    if (!checked.success) {
      return { error: "Jurisprudence invalide (voir le format attendu)." };
    }
    return { jurisprudence: checked.data };
  } catch {
    return { error: "Jurisprudence : JSON invalide." };
  }
}

const failleSchema = z.object({
  typeInfraction: z.enum(["AMENDE", "SUSPENSION"]),
  titreFaille: z.string().trim().min(3, "Titre trop court"),
  articleLoi: z.string().trim().min(1, "Article requis"),
  regle: z.string().trim().optional(),
  templateLettre: z.string().trim().min(10, "Template trop court"),
  source: z.string().trim().optional(),
});

export async function creerFaille(
  _prev: FailleState,
  formData: FormData,
): Promise<FailleState> {
  await requireAdmin();

  const parsed = failleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Champs obligatoires manquants ou invalides." };
  }
  const regles = lireRegles(formData);
  if ("error" in regles) return regles;
  const jurisprudence = lireJurisprudence(formData);
  if ("error" in jurisprudence) return jurisprudence;

  await prisma.failleJuridique.create({
    data: {
      ...parsed.data,
      regle: parsed.data.regle || null,
      reglesDetection: regles.regles.length > 0 ? regles.regles : Prisma.JsonNull,
      jurisprudence:
        jurisprudence.jurisprudence.length > 0
          ? jurisprudence.jurisprudence
          : Prisma.JsonNull,
      statut: "ACTIVE",
    },
  });

  revalidatePath("/dashboard/admin/failles");
  return { ok: true };
}

export async function modifierFaille(
  _prev: FailleState,
  formData: FormData,
): Promise<FailleState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const parsed = failleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Champs obligatoires manquants ou invalides." };
  }
  const regles = lireRegles(formData);
  if ("error" in regles) return regles;
  const jurisprudence = lireJurisprudence(formData);
  if ("error" in jurisprudence) return jurisprudence;

  await prisma.failleJuridique.update({
    where: { id },
    data: {
      ...parsed.data,
      regle: parsed.data.regle || null,
      reglesDetection: regles.regles.length > 0 ? regles.regles : Prisma.JsonNull,
      jurisprudence:
        jurisprudence.jurisprudence.length > 0
          ? jurisprudence.jurisprudence
          : Prisma.JsonNull,
    },
  });

  revalidatePath("/dashboard/admin/failles");
  return { ok: true };
}

export async function basculerFaille(
  _prev: FailleState,
  formData: FormData,
): Promise<FailleState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const faille = await prisma.failleJuridique.findUnique({ where: { id } });
  if (!faille) {
    return { error: "Faille introuvable." };
  }

  await prisma.failleJuridique.update({
    where: { id },
    data: {
      statut: faille.statut === "ACTIVE" ? "INACTIVE" : "ACTIVE",
    },
  });

  revalidatePath("/dashboard/admin/failles");
  return { ok: true };
}

/**
 * Auto-alimentation de la base juridique : importe le catalogue issu de la
 * recherche documentaire sur sources publiques (FAILLES.md §H, CATALOGUE_SOURCES)
 * en statut PROPOSEE. Les propositions ne sont JAMAIS utilisées par le moteur
 * tant que l'admin ne les a pas validées (ACTIVE). La synchronisation est
 * aussi déclenchée automatiquement (ouverture de la page admin + cron).
 */
export async function importerFaillesDepuisSources(
  _prev: FailleState,
  _formData: FormData,
): Promise<FailleState> {
  await requireAdmin();

  const count = await synchroniserCatalogue();

  revalidatePath("/dashboard/admin/failles");
  return { ok: true, count };
}

const PROPOSEE_ACTIONS = ["ACTIVE", "INACTIVE"] as const;

/**
 * Validation d'une proposition (auto-alimentation) par l'admin :
 *  - ACTIVE : la faille est retenue et utilisée par le moteur.
 *  - INACTIVE : la proposition est écartée (jurisprudence non confirmée, etc.).
 */
export async function validerPropositionFaille(
  _prev: FailleState,
  formData: FormData,
): Promise<FailleState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const action = PROPOSEE_ACTIONS.find((a) => a === formData.get("action"));
  if (!action) return { error: "Action invalide." };

  let dbOk = false;
  try {
    const faille = await prisma.failleJuridique.findUnique({ where: { id } });
    if (!faille) return { error: "Faille introuvable." };
    if (faille.statut !== "PROPOSEE") {
      return { error: "Seule une proposition peut être validée ainsi." };
    }

    await prisma.failleJuridique.update({
      where: { id },
      data: { statut: action },
    });
    dbOk = true;
  } catch (e) {
    console.error("validerPropositionFaille: DB indisponible, fallback mock", e);
    // Fallback mock si DB down : on simule la validation pour la démo
    if (!id.startsWith("faille-")) return { error: "Faille introuvable (mock)." };
    validateMockFaille(id, action);
  }

  revalidatePath("/dashboard/admin/failles");
  revalidatePath("/dashboard/juriste/failles");
  return { ok: true };
}

const importItemSchema = z.object({
  id: z.string().min(1),
  typeInfraction: z.enum(["AMENDE", "SUSPENSION"]),
  titreFaille: z.string().min(1),
  articleLoi: z.string().min(1),
  templateLettre: z.string().min(1),
  source: z.string().nullable().optional(),
  regle: z.string().nullable().optional(),
  statut: z.enum(["ACTIVE", "INACTIVE", "PROPOSEE"]).optional(),
  reglesDetection: z.array(regleSchema).nullable().optional(),
  jurisprudence: z.array(jurisprudenceSchema).nullable().optional(),
});

/**
 * Import de la base juridique par mises à jour (upsert par id) : le juriste /
 * admin maintient la base (export → modification → réimport), et le moteur
 * l'utilise immédiatement.
 */
export async function importerFailles(
  _prev: FailleState,
  formData: FormData,
): Promise<FailleState> {
  await requireAdmin();

  const raw = String(formData.get("json") ?? "").trim();
  if (!raw) {
    return { error: "Collez le JSON à importer." };
  }

  let items: unknown;
  try {
    items = JSON.parse(raw);
  } catch {
    return { error: "JSON invalide." };
  }
  if (!Array.isArray(items)) {
    return { error: "Le JSON doit être un tableau de failles." };
  }
  const checked = z.array(importItemSchema).safeParse(items);
  if (!checked.success) {
    return { error: "Champs invalides dans le JSON (voir le format exporté)." };
  }

  for (const f of checked.data) {
    await prisma.failleJuridique.upsert({
      where: { id: f.id },
      update: {
        typeInfraction: f.typeInfraction,
        titreFaille: f.titreFaille,
        articleLoi: f.articleLoi,
        templateLettre: f.templateLettre,
        source: f.source ?? null,
        regle: f.regle ?? null,
        statut: f.statut ?? "ACTIVE",
        reglesDetection: f.reglesDetection ?? Prisma.JsonNull,
        jurisprudence: f.jurisprudence ?? Prisma.JsonNull,
      },
      create: {
        id: f.id,
        typeInfraction: f.typeInfraction,
        titreFaille: f.titreFaille,
        articleLoi: f.articleLoi,
        templateLettre: f.templateLettre,
        source: f.source ?? null,
        regle: f.regle ?? null,
        statut: f.statut ?? "ACTIVE",
        reglesDetection: f.reglesDetection ?? Prisma.JsonNull,
        jurisprudence: f.jurisprudence ?? Prisma.JsonNull,
      },
    });
  }

  revalidatePath("/dashboard/admin/failles");
  return { ok: true, count: checked.data.length };
}

const radarSchema = z.object({
  radarId: z.string().trim().min(1, "Référence radar requise"),
  dateExpiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  preuveUrl: z.string().trim().optional(),
});

export async function creerRadar(
  _prev: FailleState,
  formData: FormData,
): Promise<FailleState> {
  await requireAdmin();

  const parsed = radarSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Champs obligatoires manquants ou invalides." };
  }

  await prisma.radarCalibration.create({
    data: {
      radarId: parsed.data.radarId,
      dateExpiration: new Date(`${parsed.data.dateExpiration}T00:00:00Z`),
      preuveUrl: parsed.data.preuveUrl ?? "",
    },
  });

  revalidatePath("/dashboard/admin/radars");
  return { ok: true };
}

export async function supprimerRadar(
  _prev: FailleState,
  formData: FormData,
): Promise<FailleState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  await prisma.radarCalibration.delete({ where: { id } }).catch(() => {});

  revalidatePath("/dashboard/admin/radars");
  return { ok: true };
}

export async function validerVirement(
  _prev: FailleState,
  formData: FormData,
): Promise<FailleState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) return { error: "Paiement introuvable." };
  if (payment.status !== "PENDING_VIREMENT") return { error: "Seuls les virements en attente peuvent être validés." };

  await prisma.$transaction([
    prisma.payment.update({ where: { id }, data: { status: "PAID" } }),
    prisma.user.update({ where: { id: payment.userId }, data: { credits: { increment: 1 } } }),
  ]);

  revalidatePath("/dashboard/admin/paiements");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function refuserVirement(
  _prev: FailleState,
  formData: FormData,
): Promise<FailleState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) return { error: "Paiement introuvable." };
  if (payment.status !== "PENDING_VIREMENT") return { error: "Seuls les virements en attente peuvent être refusés." };

  await prisma.payment.update({ where: { id }, data: { status: "REFUSED" } });
  revalidatePath("/dashboard/admin/paiements");
  return { ok: true };
}

export async function activerToutesPropositions(
  _prev: FailleState,
  _formData: FormData,
): Promise<FailleState> {
  await requireAdmin();

  let dbOk = false;
  try {
    const proposees = await prisma.failleJuridique.findMany({
      where: { statut: "PROPOSEE" },
      select: { id: true },
    });

    if (proposees.length === 0) {
      return { error: "Aucune proposition à activer." };
    }

    await prisma.failleJuridique.updateMany({
      where: { statut: "PROPOSEE" },
      data: { statut: "ACTIVE" },
    });
    dbOk = true;
  } catch (e) {
    console.error("activerToutesPropositions: DB indisponible, fallback mock", e);
    // Fallback mock : on active toutes les PROPOSEE du catalogue
    const { CATALOGUE_SOURCES } = await import("@/lib/catalogue-sources");
    const { validateMockFaille } = await import("@/lib/mock-failles");
    const isHistorique = new Set([
      "faille-prescription-1-an",
      "faille-mentions-obligatoires",
      "faille-erreur-plaque",
      "faille-certificat-etalonnage",
      "faille-travaux-signalisation",
      "faille-meteo-visibilite",
      "faille-cession-vehicule",
      "faille-conducteur-different",
      "faille-paiement-deja-effectue",
      "faille-adresse-erronee",
      "faille-prescription-peine-3ans",
    ]);
    for (const f of CATALOGUE_SOURCES) {
      if (!isHistorique.has(f.id)) {
        validateMockFaille(f.id, "ACTIVE");
      }
    }
  }

  revalidatePath("/dashboard/admin/failles");
  revalidatePath("/dashboard/juriste/failles");
  return { ok: true };
}
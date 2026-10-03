import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { joursRestants } from "@/lib/moteur";
import { suggestionsPreuvesClient } from "@/lib/questions";
import { libellePreuve } from "@/lib/preuve-labels";

const cleanKey = process.env.AUTH_RESEND_KEY?.replace(/^\uFEFF/, "").trim();
const resend = cleanKey ? new Resend(cleanKey) : null;
const EMAIL_FROM = (process.env.EMAIL_FROM ?? "SOS Amende <onboarding@resend.dev>")
  .replace(/^\uFEFF/, "")
  .trim();
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://recours-permis-pv.com";

export const RAPPEL_TYPES = ["J10", "J3", "J0"] as const;
export type RappelType = (typeof RAPPEL_TYPES)[number];

/**
 * Fenêtres de rappel (par date limite de contestation) :
 * J10 = il reste 10 jours ou moins (>3), J3 = 3 jours ou moins (>0), J0 = échu.
 */
export function rappelDue(dateLimite: Date, type: RappelType): boolean {
  const restants = joursRestants(dateLimite);
  if (type === "J10") return restants <= 10 && restants > 3;
  if (type === "J3") return restants <= 3 && restants > 0;
  return restants <= 0;
}

async function envoyerRappel(opts: {
  email: string;
  nom?: string | null;
  numPv?: string;
  type: RappelType;
}): Promise<boolean> {
  if (!resend) return false;

  const titre =
    opts.type === "J10"
      ? "J-10 : votre dossier de contestation approche de l'échéance"
      : opts.type === "J3"
        ? "J-3 : échéance imminente pour votre dossier"
        : "J-0 : délai de contestation dépassé";

  const message =
    opts.type === "J0"
      ? "Le délai de contestation est dépassé. Contactez-nous immédiatement."
      : "N'attendez plus : faites signer votre lettre et validez-la pour respecter le délai.";

  await resend.emails.send({
    from: "SOS Amende <onboarding@resend.dev>",
    to: opts.email,
    subject: titre,
    html: `
      <p>Bonjour${opts.nom ? ` ${opts.nom}` : ""},</p>
      <p>${opts.numPv ? `Votre dossier ${opts.numPv} : ` : ""}${message}</p>
      <p>Connectez-vous à votre espace pour suivre votre dossier.</p>
    `,
  });
  return true;
}

export type RappelResultat = {
  dossierId: string;
  type: RappelType;
  envoye: boolean;
  email: string;
};

/**
 * Deadlines manager : parcourt les dossiers en cours dont la date limite
 * entre dans une fenêtre de rappel et envoie l'e-mail (dédupliqué via
 * @@unique([dossierId, type])). Sans AUTH_RESEND_KEY, les rappels sont
 * seulement enregistrés (envoye = false).
 */
export async function chercherRappels(): Promise<RappelResultat[]> {
  const dossiers = await prisma.dossier.findMany({
    where: {
      dateLimite: { not: null },
      statut: { notIn: ["RESOLU", "ANNULE", "ENVOYE"] },
    },
    include: {
      rappels: { select: { type: true } },
      user: { select: { email: true, name: true } },
    },
  });

  const resultats: RappelResultat[] = [];
  for (const dossier of dossiers) {
    if (!dossier.dateLimite) continue;
    for (const type of RAPPEL_TYPES) {
      if (dossier.rappels.some((r) => r.type === type)) continue;
      if (!rappelDue(dossier.dateLimite, type)) continue;

      const data = (dossier.extractedData ?? {}) as { num_pv?: string };
      const envoye = await envoyerRappel({
        email: dossier.user.email,
        nom: dossier.user.name,
        numPv: data.num_pv,
        type,
      });
      await prisma.rappel
        .create({ data: { dossierId: dossier.id, type } })
        .catch(() => {});

      resultats.push({
        dossierId: dossier.id,
        type,
        envoye,
        email: dossier.user.email,
      });
    }
  }
  return resultats;
}

// ── Relance des pièces manquantes (rappel « PREUVES ») ──────────────────────

/** Type de rappel dédié : une seule relance par dossier (dédup en base). */
export const RAPPEL_TYPE_PREUVES = "PREUVES";

/** Statuts pour lesquels la pièce n'a plus d'intérêt (dépôt fait ou dossier
 * clôturé) — la relance s'arrête d'elle-même. */
export const STATUTS_HORS_RELANCE_PREUVES = [
  "BROUILLON",
  "ENVOYE",
  "REJETE",
  "ERREUR_TECHNIQUE",
  "RESOLU",
  "ANNULE",
] as const;

/**
 * Fenêtre de la relance « pièces manquantes » : pure, testée. Une pièce
 * manque ET le dossier est encore en cours côté client → relance due.
 */
export function relancePreuvesDue(
  nbPiecesManquantes: number,
  statut: string,
): boolean {
  return (
    nbPiecesManquantes > 0 &&
    !(STATUTS_HORS_RELANCE_PREUVES as readonly string[]).includes(statut)
  );
}

/** Démarrage progressif : date de mise en service de la relance (premier
 * périmètre = seuls les dossiers créés à partir de cette date). */
const SEUIL_PREUVES_DEFAUT = "2026-10-03";

/**
 * Seuil `createdAt` de la relance « pièces manquantes » — pure, testée.
 * `RAPPEL_PREUVES_DEPUIS` (ISO `YYYY-MM-DD`) étend ou restreint le
 * périmètre ; valeur absente ou invalide → seuil par défaut (démarrage
 * progressif : pas de rappel aux dossiers antérieurs). Pour inclure tout
 * le portefeuille, poser une date ancienne (ex. `2020-01-01`).
 */
export function dateSeuilRelancePreuves(
  raw: string | undefined = process.env.RAPPEL_PREUVES_DEPUIS,
): Date {
  const cand = raw?.trim();
  const parsed = cand ? new Date(cand) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  return new Date(`${SEUIL_PREUVES_DEFAUT}T00:00:00.000Z`);
}

async function envoyerRappelPreuves(opts: {
  email: string;
  nom?: string | null;
  numPv?: string;
  dossierId: string;
  libelles: string[];
}): Promise<boolean> {
  if (!resend) return false;

  await resend.emails.send({
    from: EMAIL_FROM,
    to: opts.email,
    subject: "Une pièce manque dans votre dossier de contestation",
    html: `
      <p>Bonjour${opts.nom ? ` ${opts.nom}` : ""},</p>
      <p>Votre questionnaire signale une pièce utile pour votre dossier${
        opts.numPv ? ` n° ${opts.numPv}` : ""
      } : <strong>${opts.libelles.join(", ")}</strong>.</p>
      <p>Joignez-la depuis votre espace (bloc « Pièces justificatives ») —
      c&apos;est facultatif : votre dossier n&apos;est pas bloqué sans elle,
      mais elle renforce la contestation.</p>
      <p><a href="${APP_URL}/dashboard/cases/${opts.dossierId}#preuves">Ouvrir mon dossier</a></p>
    `,
  });
  return true;
}

export type RappelPreuvesResultat = {
  dossierId: string;
  envoye: boolean;
  email: string;
  libelles: string[];
};

/**
 * Relance douce des pièces manquantes (cron quotidien, même route que
 * J10/J3/J0) : une seule fois par dossier, dédupliquée via le type
 * `PREUVES` (colonne `Rappel.type` en String + `@@unique([dossierId, type])`).
 * Dès que la pièce est versée, plus aucune relance ; défensif sans
 * `AUTH_RESEND_KEY` (relance enregistrée, `envoye = false`).
 */
export async function chercherRappelsPreuves(): Promise<RappelPreuvesResultat[]> {
  const dossiers = await prisma.dossier.findMany({
    where: {
      statut: { notIn: [...STATUTS_HORS_RELANCE_PREUVES] },
      // Démarrage progressif : les dossiers antérieurs au seuil ne sont
      // jamais relancés (voir dateSeuilRelancePreuves).
      createdAt: { gte: dateSeuilRelancePreuves() },
    },
    include: {
      rappels: { where: { type: RAPPEL_TYPE_PREUVES }, select: { type: true } },
      user: { select: { email: true, name: true } },
      preuves: { select: { type: true } },
    },
  });

  const resultats: RappelPreuvesResultat[] = [];
  for (const dossier of dossiers) {
    if (dossier.rappels.length > 0) continue;
    const manquantes = suggestionsPreuvesClient(
      dossier.extractedData as Record<string, unknown> | null,
      dossier.preuves.map((p) => p.type),
    );
    if (!relancePreuvesDue(manquantes.length, dossier.statut)) continue;

    const libelles = manquantes.map((m) => libellePreuve(m.type));
    const data = (dossier.extractedData ?? {}) as { num_pv?: string };
    const envoye = await envoyerRappelPreuves({
      email: dossier.user.email,
      nom: dossier.user.name,
      numPv: data.num_pv,
      dossierId: dossier.id,
      libelles,
    });
    await prisma.rappel
      .create({ data: { dossierId: dossier.id, type: RAPPEL_TYPE_PREUVES } })
      .catch(() => {});

    resultats.push({
      dossierId: dossier.id,
      envoye,
      email: dossier.user.email,
      libelles,
    });
  }
  return resultats;
}
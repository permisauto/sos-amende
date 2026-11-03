import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { joursRestants } from "@/lib/moteur";
import { suggestionsPreuvesClient } from "@/lib/questions";
import { chargerQuestionsDynamiques } from "@/lib/questions-dyn";
import { libellePreuve } from "@/lib/preuve-labels";

const cleanKey = process.env.AUTH_RESEND_KEY?.replace(/^\uFEFF/, "").trim();
const resend = cleanKey ? new Resend(cleanKey) : null;
const EMAIL_FROM = (process.env.EMAIL_FROM ?? "SOS Amende <onboarding@resend.dev>")
  .replace(/^\uFEFF/, "")
  .trim();
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://recours-permis-pv.com";

export const RAPPEL_TYPES = ["J10", "J3", "J0"] as const;
export type RappelType = (typeof RAPPEL_TYPES)[number];

/** Statuts de dossier clôturé ou sans objet : plus aucune relance — ni
 * échéances J10/J3/J0, ni pièces manquantes (un dossier rejeté ou déjà déposé
 * ne reçoit plus « faites signer votre lettre… », audit lot 3). */
export const STATUTS_HORS_RELANCE_PREUVES = [
  "BROUILLON",
  "ENVOYE",
  "REJETE",
  "ERREUR_TECHNIQUE",
  "RESOLU",
  "ANNULE",
] as const;

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
    from: EMAIL_FROM,
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
      statut: { notIn: [...STATUTS_HORS_RELANCE_PREUVES] },
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

// ── Relance paiement virement (J+3 / J+7) ──────────────────────────────────

/** Type de rappel dédié : relance pour paiement virement en attente. */
export const RAPPEL_TYPE_PAIEMENT = "PAIEMENT";

/** Fenêtres de relance paiement (jours après création du payment PENDING_VIREMENT). */
export const PAIEMENT_RELANCE_JOURS = [3, 7] as const;
export type PaiementRelanceJour = (typeof PAIEMENT_RELANCE_JOURS)[number];

/**
 * Vérifie si une relance paiement est due pour un délai donné.
 * Pure, testée.
 */
export function relancePaiementDue(
  createdAt: Date,
  jourRelance: PaiementRelanceJour,
): boolean {
  const diffMs = Date.now() - createdAt.getTime();
  const diffJours = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffJours >= jourRelance;
}

async function envoyerRappelPaiement(opts: {
  email: string;
  nom?: string | null;
  montant: number;
  paymentId: string;
  jourRelance: PaiementRelanceJour;
}): Promise<boolean> {
  if (!resend) return false;

  const titre = `Rappel J+${opts.jourRelance} : votre virement est en attente de validation`;
  const montantStr = `${Number(opts.montant).toFixed(2).replace(".", ",")} €`;

  await resend.emails.send({
    from: EMAIL_FROM,
    to: opts.email,
    subject: titre,
    html: `
      <p>Bonjour${opts.nom ? ` ${opts.nom}` : ""},</p>
      <p>Votre demande de virement de <strong>${montantStr}</strong> (réf. <code>${opts.paymentId.slice(0, 8)}</code>) est en attente de validation par notre équipe.</p>
      <p>Merci d'avoir effectué le virement. Si vous n'avez pas encore envoyé la preuve de virement, merci de la déposer depuis votre espace client.</p>
      <p><a href="${APP_URL}/dashboard/paiement/${opts.paymentId}">Voir mon paiement</a></p>
      <p style="font-size: 12px; color: #666;">Ceci est un rappel automatique (J+${opts.jourRelance}). Si le virement a déjà été validé, ignorez ce message.</p>
    `,
  });
  return true;
}

export type RappelPaiementResultat = {
  paymentId: string;
  jourRelance: PaiementRelanceJour;
  envoye: boolean;
  email: string;
};

/**
 * Relance paiement virement : J+3 et J+7 après création du payment PENDING_VIREMENT.
 * Dédupliquée via type `PAIEMENT_J3` / `PAIEMENT_J7` (colonne `Rappel.type`).
 * Sans AUTH_RESEND_KEY : relance enregistrée, `envoye = false`.
 */
export async function chercherRappelsPaiement(): Promise<RappelPaiementResultat[]> {
  // Récupérer les paiements en attente
  const payments = await prisma.payment.findMany({
    where: {
      status: "PENDING_VIREMENT",
    },
    include: {
      user: { select: { email: true, name: true } },
      dossier: { select: { id: true } },
    },
  });

  // Récupérer les rappels de paiement existants pour déduplication
  const existingRappels = await prisma.rappel.findMany({
    where: {
      type: { startsWith: "PAIEMENT_J" },
    },
    select: { type: true, dossierId: true },
  });
  const existingByTypeAndDossier = new Map<string, Set<string>>();
  for (const r of existingRappels) {
    if (!existingByTypeAndDossier.has(r.type)) {
      existingByTypeAndDossier.set(r.type, new Set());
    }
    existingByTypeAndDossier.get(r.type)!.add(r.dossierId);
  }

  const resultats: RappelPaiementResultat[] = [];

  for (const payment of payments) {
    const dossierId = payment.dossierId ?? "";
    for (const jourRelance of PAIEMENT_RELANCE_JOURS) {
      const typeRappel = `PAIEMENT_J${jourRelance}` as const;

      // Vérifier si déjà envoyé (via Map pour perf)
      const existingForType = existingByTypeAndDossier.get(typeRappel);
      if (existingForType?.has(dossierId)) continue;

      if (!relancePaiementDue(payment.createdAt, jourRelance)) continue;

      const envoye = await envoyerRappelPaiement({
        email: payment.user.email,
        nom: payment.user.name,
        montant: Number(payment.amount),
        paymentId: payment.id,
        jourRelance,
      });

      await prisma.rappel
        .create({ data: { dossierId, type: typeRappel } })
        .catch(() => {});

      resultats.push({
        paymentId: payment.id,
        jourRelance,
        envoye,
        email: payment.user.email,
      });
    }
  }
  return resultats;
}

// ── Relance des pièces manquantes (rappel « PREUVES ») ──────────────────────

/** Type de rappel dédié : une seule relance par dossier (dédup en base). */
export const RAPPEL_TYPE_PREUVES = "PREUVES";

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
  // Veille 2.0 : les pièces suggérées par les questions dynamiques sont
  // relancées au même titre que les pièces du registre (best-effort).
  const dynamiques =
    (await chargerQuestionsDynamiques().catch(() => null)) ?? null;
  for (const dossier of dossiers) {
    if (dossier.rappels.length > 0) continue;
    const manquantes = suggestionsPreuvesClient(
      dossier.extractedData as Record<string, unknown> | null,
      dossier.preuves.map((p) => p.type),
      dynamiques?.[dossier.type as "AMENDE" | "SUSPENSION"] ?? [],
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
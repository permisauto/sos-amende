import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { joursRestants } from "@/lib/moteur";

const resend = process.env.AUTH_RESEND_KEY
  ? new Resend(process.env.AUTH_RESEND_KEY)
  : null;

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
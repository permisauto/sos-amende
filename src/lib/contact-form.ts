import { z } from "zod";

/** E-mail du support SOS Amende — destinataire des messages reçus. */
export const SOS_CONTACT_EMAIL = "contact@recours-permis-pv.com";

/** Sujets proposés dans le formulaire de contact (alignés sur le produit). */
export const SUJETS_CONTACT = [
  "Question avant de commander",
  "Paiement / virement",
  "Mon dossier",
  "Rétractation / remboursement",
  "Réclamation",
  "Données personnelles (RGPD)",
  "Autre",
] as const;

/** Schéma de validation du formulaire de contact. */
export const contactSchema = z.object({
  nom: z.string().trim().min(2).max(100),
  email: z.email(),
  sujet: z.enum(SUJETS_CONTACT),
  dossier: z.string().trim().max(40).optional().default(""),
  message: z.string().trim().min(10).max(3000),
  site: z.string().optional().default(""),
});

export type ContactData = {
  nom: string;
  email: string;
  sujet: string;
  dossier: string;
  message: string;
};

export type ResultatContact =
  | { ok: true; data: ContactData }
  | { ok: false; erreur: string };

/** Message d'erreur français selon le champ en défaut. */
function messageErreur(chemin: readonly PropertyKey[]): string {
  const champ = String(chemin[0] ?? "");
  switch (champ) {
    case "nom":
      return "Le nom doit contenir entre 2 et 100 caractères.";
    case "email":
      return "Adresse e-mail invalide.";
    case "sujet":
      return "Sujet invalide.";
    case "dossier":
      return "Le numéro de dossier est trop long (40 caractères maximum).";
    case "message":
      return "Le message doit contenir entre 10 et 3 000 caractères.";
    case "site":
      return "Champ invalide.";
    default:
      return "Champs invalides.";
  }
}

/**
 * Valide les données du formulaire de contact. Le champ `site` (piège
 * anti-robot) doit rester vide : s'il est rempli, la saisie est refusée.
 */
export function validerContact(brut: unknown): ResultatContact {
  const parsed = contactSchema.safeParse(brut);
  if (!parsed.success) {
    return {
      ok: false,
      erreur: messageErreur(parsed.error.issues[0]?.path ?? []),
    };
  }
  if ((parsed.data.site ?? "").trim().length > 0) {
    return { ok: false, erreur: "Champ invalide." };
  }
  const { site: _site, ...data } = parsed.data;
  return { ok: true, data };
}

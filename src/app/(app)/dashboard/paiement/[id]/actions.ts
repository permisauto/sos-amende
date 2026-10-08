"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { Resend } from "resend";
import { montantAvecOption, libelleMontant, PRIX_OPTION_LRAR } from "@/lib/tarifs";
import { RIB } from "@/lib/rib";

export type VirementState = { ok?: boolean; error?: string; paymentId?: string } | undefined;

export async function payerParVirement(_prev: VirementState, formData: FormData): Promise<VirementState> {
  const user = await requireUser();
  const dossierId = String(formData.get("dossierId") ?? "");
  const nom = String(formData.get("nom") ?? "").trim();
  const prenom = String(formData.get("prenom") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const whatsapp = String(formData.get("whatsapp") ?? "").trim();
  const optionLrar = formData.get("optionLrar") === "1";

  if (!nom || !prenom || !email) return { error: "Nom, prénom et email requis." };
  if (!whatsapp) return { error: "Numéro WhatsApp requis." };

  const dossier = await prisma.dossier.findFirst({ where: { id: dossierId, userId: user.id } });
  if (!dossier) return { error: "Dossier introuvable." };
  if (dossier.statut !== "EN_ATTENTE_PAIEMENT") {
    return { error: "Ce dossier n'est pas en attente de paiement." };
  }

  const montant = montantAvecOption(dossier.type, optionLrar);

  // Sauvegarde contact dans extractedData et User
  const data = (dossier.extractedData as Record<string, unknown> | null) ?? {};
  const [payment] = await prisma.$transaction([
    prisma.payment.create({
      data: {
        userId: user.id,
        dossierId: dossier.id,
        amount: montant,
        currency: "EUR",
        status: "PENDING_VIREMENT",
        kind: dossier.type,
        optionLrar,
      },
    }),
    prisma.dossier.update({
      where: { id: dossier.id },
      data: { extractedData: { ...data, contactNom: nom, contactPrenom: prenom, contactEmail: email, contactWhatsapp: whatsapp } as object },
    }),
    prisma.user.update({ where: { id: user.id }, data: { name: `${prenom} ${nom}`, telephone: whatsapp } }),
    prisma.dossierEvent.create({ data: { dossierId: dossier.id, type: "EN_ATTENTE", detail: `Virement demandé — ${prenom} ${nom} / ${whatsapp}${optionLrar ? " (+ LRAR)" : ""}` } }),
  ]);

  revalidatePath(`/dashboard/paiement/${dossierId}`);

  // Email confirmation d'inscription (défensif)
  try {
    const key = process.env.AUTH_RESEND_KEY?.replace(/^\uFEFF/, "").trim();
    if (key) {
      const resend = new Resend(key);
      const from = process.env.EMAIL_FROM ?? "SOS Amende <onboarding@resend.dev>";
      const libelle = libelleMontant(dossier.type, optionLrar);
      const optionLinee = optionLrar ? `<p>Option « lettre recommandée » incluse (+${PRIX_OPTION_LRAR} €).</p>` : "";
      await resend.emails.send({
        from,
        to: email,
        subject: "SOS Amende — votre compte est créé, virement en attente",
        html: `<p>Bonjour ${prenom},</p><p>Votre dossier ${dossier.type} est en attente de virement ${libelle}.</p>${optionLinee}<p><strong>RIB :</strong> ${RIB.iban} / BIC ${RIB.bic} / Titulaire ${RIB.titulaire}</p><p><strong>Référence :</strong> ${dossier.id.slice(0, 8).toUpperCase()} — ${prenom} ${nom}</p><p>Dès que le virement est effectué, envoyez la référence + capture par email à contact@recours-permis-pv.com ou WhatsApp ${whatsapp}. Un juriste validera sous 24h.</p>`,
      });
    }
  } catch (e) {
    console.error("virement email fail", e);
  }

  return { ok: true, paymentId: payment.id };
}

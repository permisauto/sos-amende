"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { Resend } from "resend";

export type VirementState = { ok?: boolean; error?: string } | undefined;

export async function payerParVirement(_prev: VirementState, formData: FormData): Promise<VirementState> {
  const user = await requireUser();
  const dossierId = String(formData.get("dossierId") ?? "");
  const nom = String(formData.get("nom") ?? "").trim();
  const prenom = String(formData.get("prenom") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const whatsapp = String(formData.get("whatsapp") ?? "").trim();

  if (!nom || !prenom || !email) return { error: "Nom, prénom et email requis." };
  if (!whatsapp) return { error: "Numéro WhatsApp requis." };

  const dossier = await prisma.dossier.findFirst({ where: { id: dossierId, userId: user.id } });
  if (!dossier) return { error: "Dossier introuvable." };

  // Sauvegarde contact dans extractedData et User
  const data = (dossier.extractedData as Record<string, unknown> | null) ?? {};
  await prisma.$transaction([
    prisma.dossier.update({
      where: { id: dossier.id },
      data: { extractedData: { ...data, contactNom: nom, contactPrenom: prenom, contactEmail: email, contactWhatsapp: whatsapp } as object },
    }),
    prisma.user.update({ where: { id: user.id }, data: { name: `${prenom} ${nom}` } }),
    prisma.payment.create({
      data: {
        userId: user.id,
        amount: dossier.type === "SUSPENSION" ? 59 : 39,
        currency: "EUR",
        status: "PENDING_VIREMENT",
        kind: dossier.type,
      },
    }),
    prisma.dossierEvent.create({ data: { dossierId: dossier.id, type: "EN_ATTENTE", detail: `Virement demandé — ${prenom} ${nom} / ${whatsapp}` } }),
  ]);

  revalidatePath(`/dashboard/paiement/${dossierId}`);

  // Email confirmation d'inscription (défensif)
  try {
    const key = process.env.AUTH_RESEND_KEY?.replace(/^\uFEFF/, "").trim();
    if (key) {
      const resend = new Resend(key);
      const from = process.env.EMAIL_FROM ?? "SOS Amende <onboarding@resend.dev>";
      const iban = process.env.NEXT_PUBLIC_RIB_IBAN ?? process.env.RIB_IBAN ?? "FR76 3000 4000 0500 0012 3456 789";
      const bic = process.env.NEXT_PUBLIC_RIB_BIC ?? process.env.RIB_BIC ?? "BNPAFRPPXXX";
      const titulaire = process.env.NEXT_PUBLIC_RIB_TITULAIRE ?? process.env.RIB_TITULAIRE ?? "SOS AMENDE - TEST";
      await resend.emails.send({
        from,
        to: email,
        subject: "SOS Amende — votre compte est créé, virement en attente",
        html: `<p>Bonjour ${prenom},</p><p>Votre dossier ${dossier.type} est en attente de virement ${dossier.type === "SUSPENSION" ? "59" : "39"} €.</p><p><strong>RIB :</strong> ${iban} / BIC ${bic} / Titulaire ${titulaire}</p><p><strong>Référence :</strong> ${dossier.id.slice(0, 8).toUpperCase()} — ${prenom} ${nom}</p><p>Dès que le virement est effectué, envoyez la référence + capture par email à contact@sos-amende.fr ou WhatsApp ${whatsapp}. Un juriste validera sous 24h.</p>`,
      });
    }
  } catch (e) {
    console.error("virement email fail", e);
  }

  return { ok: true };
}

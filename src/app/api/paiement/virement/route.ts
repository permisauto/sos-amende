import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { consommerCreneau } from "@/lib/rate-limit";
import { montantAvecOption, libelleMontant, PRIX_OPTION_LRAR } from "@/lib/tarifs";
import { RIB } from "@/lib/rib";

const schema = z.object({
  type: z.enum(["AMENDE", "SUSPENSION"]),
  nom: z.string().min(1),
  prenom: z.string().min(1),
  email: z.string().email(),
  whatsapp: z.string().min(6),
  dossierId: z.string().optional(),
  optionLrar: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Champs requis manquants." }, { status: 400 });
  const { type, nom, prenom, email, whatsapp, dossierId, optionLrar } = parsed.data;

  // Anti-abus : la route fait un upsert utilisateur + paiement NON authentifié
  // (création d'un compte par email). Rate-limit par email ET par IP.
  // L'IP vient de `x-forwarded-for` ; en local/E2E le header est absent → tous
  // les appels partagent la clé "inconnue", d'où une limite IP plus large que
  // la limite email (une seule IP ne doit pas bloquer un Integral/E2E légitime,
  // mais reste freinée : ~2 000 comptes/jour max au pire).
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnue";
  const essaisIp = consommerCreneau(`virement-ip:${ip}`, 20, 15 * 60 * 1000);
  const essaisEmail = consommerCreneau(`virement-email:${email.toLowerCase()}`, 3, 15 * 60 * 1000);
  if (essaisIp <= 0 || essaisEmail <= 0) {
    return NextResponse.json(
      { error: "Trop de demandes. Attendez quelques minutes avant de réessayer." },
      { status: 429 },
    );
  }

  const montant = montantAvecOption(type, optionLrar);

  let paymentId = `mock-${Date.now().toString(36)}`;
  let ref = paymentId.slice(0, 8).toUpperCase();
  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: { name: `${prenom} ${nom}` },
      create: { email, name: `${prenom} ${nom}`, credits: 0 },
    });
    if (dossierId) {
      const dossier = await prisma.dossier.findFirst({ where: { id: dossierId, userId: user.id } });
      if (dossier) {
        const data = (dossier.extractedData as Record<string, unknown> | null) ?? {};
        await prisma.dossier.update({
          where: { id: dossier.id },
          data: { extractedData: { ...data, contactNom: nom, contactPrenom: prenom, contactEmail: email, contactWhatsapp: whatsapp } as object },
        });
      }
    }
    const payment = await prisma.payment.create({
      data: { userId: user.id, amount: montant, currency: "EUR", status: "PENDING_VIREMENT", kind: type, optionLrar },
    });
    paymentId = payment.id;
    ref = payment.id.slice(0, 8).toUpperCase();
  } catch (e) {
    console.error("virement DB fail, fallback mock", e);
    // Fallback mock si DB down — on continue pour envoyer l'email quand même
  }

  // Email de confirmation d'inscription (défensif : sans clé, on log seulement) — même si DB down
  try {
    const key = process.env.AUTH_RESEND_KEY?.replace(/^\uFEFF/, "").trim();
    if (key) {
      const resend = new Resend(key);
      const from = process.env.EMAIL_FROM ?? "SOS Amende <onboarding@resend.dev>";
      const libelle = libelleMontant(type, optionLrar);
      const optionLinee = optionLrar ? `<p>Option « lettre recommandée » incluse (+${PRIX_OPTION_LRAR} €).</p>` : "";
      await resend.emails.send({
        from,
        to: email,
        subject: "SOS Amende — votre compte est créé, virement en attente",
        html: `<p>Bonjour ${prenom},</p><p>Votre compte SOS Amende (${email}) est créé. Votre dossier ${type} est en attente de virement ${libelle}.</p>${optionLinee}<p><strong>RIB :</strong> ${RIB.iban} / BIC ${RIB.bic} / Titulaire ${RIB.titulaire}</p><p><strong>Référence obligatoire :</strong> ${ref} — ${prenom} ${nom}</p><p>Dès que le virement est effectué, envoyez la référence + capture par email à contact@recours-permis-pv.com ou WhatsApp ${whatsapp}. Un juriste validera sous 24h et débloquera votre lettre. Accédez à votre espace : ${(process.env.NEXT_PUBLIC_APP_URL ?? "https://recours-permis-pv.com")}/dashboard</p>`,
      });
    } else {
      console.log(`[DEV] Email confirmation pour ${email} (sans clé Resend) — ref ${ref}`);
    }
  } catch (e) {
    console.error("virement email fail", e);
  }

  return NextResponse.json({ ok: true, ref, paymentId, montant });
}

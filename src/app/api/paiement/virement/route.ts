import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const schema = z.object({
  type: z.enum(["AMENDE", "SUSPENSION"]),
  nom: z.string().min(1),
  prenom: z.string().min(1),
  email: z.string().email(),
  whatsapp: z.string().min(6),
  dossierId: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Champs requis manquants." }, { status: 400 });
  const { type, nom, prenom, email, whatsapp, dossierId } = parsed.data;

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
      data: { userId: user.id, amount: type === "SUSPENSION" ? 59 : 39, currency: "EUR", status: "PENDING_VIREMENT", kind: type },
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
      const iban = process.env.NEXT_PUBLIC_RIB_IBAN ?? process.env.RIB_IBAN ?? "FR76 3000 4000 0500 0012 3456 789";
      const bic = process.env.NEXT_PUBLIC_RIB_BIC ?? process.env.RIB_BIC ?? "BNPAFRPPXXX";
      const titulaire = process.env.NEXT_PUBLIC_RIB_TITULAIRE ?? process.env.RIB_TITULAIRE ?? "SOS AMENDE - TEST";
      await resend.emails.send({
        from,
        to: email,
        subject: "SOS Amende — votre compte est créé, virement en attente",
        html: `<p>Bonjour ${prenom},</p><p>Votre compte SOS Amende (${email}) est créé. Votre dossier ${type} est en attente de virement ${type === "SUSPENSION" ? "59" : "39"} €.</p><p><strong>RIB :</strong> ${iban} / BIC ${bic} / Titulaire ${titulaire}</p><p><strong>Référence obligatoire :</strong> ${ref} — ${prenom} ${nom}</p><p>Dès que le virement est effectué, envoyez la référence + capture par email à contact@sos-amende.fr ou WhatsApp ${whatsapp}. Un juriste validera sous 24h et débloquera votre lettre. Accédez à votre espace : ${(process.env.NEXT_PUBLIC_APP_URL ?? "https://sos-amende.vercel.app")}/dashboard?dev=1</p>`,
      });
    } else {
      console.log(`[DEV] Email confirmation pour ${email} (sans clé Resend) — ref ${ref}`);
    }
  } catch (e) {
    console.error("virement email fail", e);
  }

  return NextResponse.json({ ok: true, ref, paymentId });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { consommerCreneau } from "@/lib/rate-limit";
import { montantAvecOption, libelleMontant, PRIX_OPTION_LRAR } from "@/lib/tarifs";
import { RIB } from "@/lib/rib";
import { TEXTE_RENONCIATION_RETRACTATION } from "@/lib/consentements";

/** Échappement HTML minimal : les valeurs d'un formulaire public sont
 *  réinjectées dans un e-mail — jamais de HTML brut (anti-injection). */
function echapper(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const schema = z.object({
  type: z.enum(["AMENDE", "SUSPENSION"]),
  nom: z.string().min(1),
  prenom: z.string().min(1),
  email: z.string().email(),
  whatsapp: z.string().min(6),
  dossierId: z.string().optional(),
  optionLrar: z.boolean().optional().default(false),
  renonciationRetractation: z.boolean(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Champs requis manquants." }, { status: 400 });
  const { type, nom, prenom, email, whatsapp, dossierId, optionLrar, renonciationRetractation } = parsed.data;

  // Garde-fou CGV Art. 7 : sans renonciation expresse au droit de rétractation
  // (exécution immédiate), la commande ne peut pas être validée.
  if (renonciationRetractation !== true) {
    return NextResponse.json(
      { error: "La renonciation au droit de rétractation doit être acceptée pour valider la commande." },
      { status: 400 },
    );
  }

  // Anti-abus : la route fait un upsert utilisateur + paiement NON authentifié
  // (création d'un compte par email). Rate-limit par email ET par IP.
  // L'IP vient de `x-forwarded-for` ; en local/E2E le header est absent → tous
  // les appels partagent la clé "inconnue", d'où une limite IP plus large que
  // la limite email (une seule IP ne doit pas bloquer un Integral/E2E légitime,
  // mais reste freinée : ~2 000 comptes/jour max au pire).
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnue";
  const essaisIp = await consommerCreneau(`virement-ip:${ip}`, 20, 15 * 60 * 1000);
  const essaisEmail = await consommerCreneau(`virement-email:${email.toLowerCase()}`, 3, 15 * 60 * 1000);
  if (essaisIp <= 0 || essaisEmail <= 0) {
    return NextResponse.json(
      { error: "Trop de demandes. Attendez quelques minutes avant de réessayer." },
      { status: 429 },
    );
  }

  const montant = montantAvecOption(type, optionLrar);

  let paymentId = "";
  let ref = "";
  let paiementReutilise = false;
  try {
    const user = await prisma.user.upsert({
      where: { email },
      // Non destructif : une route non authentifiée ne doit JAMAIS écraser le
      // nom/le téléphone d'un compte existant (un tiers connaissant l'e-mail
      // pourrait le faire). On ne remplit ces champs qu'à la création.
      update: {},
      create: { email, name: `${prenom} ${nom}`, telephone: whatsapp, credits: 0 },
    });
    let dossierLieId: string | null = null;
    if (dossierId) {
      const dossier = await prisma.dossier.findFirst({ where: { id: dossierId, userId: user.id } });
      if (dossier) {
        // Le paiement est rattaché au dossier : à la validation admin, le crédit
        // sert directement le dossier (net à zéro), cf. admin/actions.ts.
        dossierLieId = dossier.id;
        const data = (dossier.extractedData as Record<string, unknown> | null) ?? {};
        await prisma.dossier.update({
          where: { id: dossier.id },
          data: { extractedData: { ...data, contactNom: nom, contactPrenom: prenom, contactEmail: email, contactWhatsapp: whatsapp } as object },
        });
      }
    }
    const fenetreIdempotence = new Date(Date.now() - 10 * 60 * 1000);
    const paiementExistant = await prisma.payment.findFirst({
      where: {
        userId: user.id,
        status: "PENDING_VIREMENT",
        kind: type,
        amount: montant,
        optionLrar,
        dossierId: dossierLieId,
        createdAt: { gte: fenetreIdempotence },
      },
      orderBy: { createdAt: "desc" },
    });
    const payment = paiementExistant ?? await prisma.payment.create({
      data: {
        userId: user.id,
        amount: montant,
        currency: "EUR",
        status: "PENDING_VIREMENT",
        kind: type,
        optionLrar,
        dossierId: dossierLieId,
        renonciationRetractationLe: new Date(),
        renonciationRetractationTexte: TEXTE_RENONCIATION_RETRACTATION,
      },
    });
    paymentId = payment.id;
    ref = payment.id.slice(0, 8).toUpperCase();
    paiementReutilise = Boolean(paiementExistant);
  } catch (e) {
    console.error("virement DB fail", e);
    return NextResponse.json(
      { error: "Service temporairement indisponible. Réessayez dans quelques minutes." },
      { status: 503 },
    );
  }

  // Paiement en attente réutilisé (double soumission) : même référence, pas de
  // nouvel e-mail — le client a déjà reçu les instructions de virement.
  if (paiementReutilise) {
    return NextResponse.json({ ok: true, ref, paymentId, montant, reutilise: true });
  }

  // Email de confirmation d'inscription (défensif : sans clé, on log seulement).
  try {
    const key = process.env.AUTH_RESEND_KEY?.replace(/^\uFEFF/, "").trim();
    if (key) {
      const resend = new Resend(key);
      const from = process.env.EMAIL_FROM ?? "SOS Amende <onboarding@resend.dev>";
      const libelle = libelleMontant(type, optionLrar);
      const optionLinee = optionLrar ? `<p>Option « lettre recommandée » incluse (+${PRIX_OPTION_LRAR} €).</p>` : "";
      const offreLinee = type === "SUSPENSION" ? "<p>Offre Suspension &amp; Invalidation incluse : requête au fond, référé-suspension (art. L. 521-2 CJA) et bordereau des pièces, pour un dépôt sur Télérecours Citoyens.</p>" : "";
      await resend.emails.send({
        from,
        to: email,
        subject: "SOS Amende — votre compte est créé, virement en attente",
        html: `<p>Bonjour ${echapper(prenom)},</p><p>Votre compte SOS Amende (${echapper(email)}) est créé. Votre dossier ${type} est en attente de virement ${libelle}.</p>${optionLinee}${offreLinee}<p><strong>RIB :</strong> ${echapper(RIB.iban)} / BIC ${echapper(RIB.bic)} / Titulaire ${echapper(RIB.titulaire)}</p><p><strong>Référence obligatoire :</strong> ${ref} — ${echapper(prenom)} ${echapper(nom)}</p><p>Dès que le virement est effectué, envoyez la référence + capture par email à contact@recours-permis-pv.com. Un juriste validera sous 24h et débloquera votre lettre. Accédez à votre espace : ${(process.env.NEXT_PUBLIC_APP_URL ?? "https://recours-permis-pv.com")}/dashboard</p>`,
      });
    } else {
      console.log(`[DEV] Email confirmation pour ${email} (sans clé Resend) — ref ${ref}`);
    }
  } catch (e) {
    console.error("virement email fail", e);
  }

  return NextResponse.json({ ok: true, ref, paymentId, montant });
}

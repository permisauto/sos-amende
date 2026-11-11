import { NextResponse } from "next/server";
import { Resend } from "resend";
import { consommerCreneau } from "@/lib/rate-limit";
import { validerContact, SOS_CONTACT_EMAIL } from "@/lib/contact-form";

/** Échappement HTML minimal (réutilisé localement, comme dans la route virement). */
function echapper(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Envoyé depuis le formulaire public : anti-abus par IP (5 messages/heure). */
const MAX_MESSAGES_PAR_HEURE = 5;
const FENETRE_MS = 60 * 60 * 1000;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Formulaire invalide." }, { status: 400 });
  }

  // Piège anti-robot : si le champ caché `site` est rempli, on répond comme si
  // tout allait bien mais on n'envoie rien (ne jamais révéler le piège).
  if (String(form.get("site") ?? "").trim().length > 0) {
    return NextResponse.json({ ok: true });
  }

  const resultat = validerContact({
    nom: String(form.get("nom") ?? ""),
    email: String(form.get("email") ?? ""),
    sujet: String(form.get("sujet") ?? ""),
    dossier: String(form.get("dossier") ?? ""),
    message: String(form.get("message") ?? ""),
    site: "",
  });
  if (!resultat.ok) {
    return NextResponse.json({ error: resultat.erreur }, { status: 400 });
  }
  const { nom, email, sujet, dossier, message } = resultat.data;

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnue";
  const restant = await consommerCreneau(
    `contact:ip:${ip}`,
    MAX_MESSAGES_PAR_HEURE,
    FENETRE_MS,
  );
  if (restant <= 0) {
    return NextResponse.json(
      { error: "Trop de messages. Veuillez réessayer dans une heure." },
      { status: 429 },
    );
  }

  const key = process.env.AUTH_RESEND_KEY?.replace(/^\uFEFF/, "").trim();
  const from =
    process.env.EMAIL_FROM ?? "SOS Amende <onboarding@resend.dev>";
  if (!key) {
    console.log(
      `[contact] Pas de clé Resend — message non envoyé (${email}, sujet « ${sujet} »)`,
    );
    return NextResponse.json({ ok: true });
  }

  try {
    const resend = new Resend(key);
    const dossierLigne = dossier
      ? `<p><strong>Numéro de dossier :</strong> ${echapper(dossier)}</p>`
      : "";
    await Promise.all([
      resend.emails.send({
        from,
        to: SOS_CONTACT_EMAIL,
        replyTo: email,
        subject: `[Contact] ${sujet} — ${nom}`,
        html: `<p><strong>Nom :</strong> ${echapper(nom)}</p><p><strong>Email :</strong> ${echapper(email)}</p><p><strong>Sujet :</strong> ${echapper(sujet)}</p>${dossierLigne}<p><strong>Message :</strong></p><p>${echapper(message).replace(/\n/g, "<br/>")}</p>`,
      }),
      resend.emails.send({
        from,
        to: email,
        subject: "SOS Amende — nous avons bien reçu votre message",
        html: `<p>Bonjour ${echapper(nom)},</p><p>Nous avons bien reçu votre message. Nous vous répondrons sous 7 jours.</p><p>Rappel : nous répondons aux questions sur le service, pas aux questions juridiques sur votre situation ; n'envoyez pas de documents ni de données sensibles par email.</p>`,
      }),
    ]);
  } catch (e) {
    console.error("contact email fail", e);
  }

  return NextResponse.json({ ok: true });
}

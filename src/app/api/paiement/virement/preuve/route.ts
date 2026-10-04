import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { storageDelete, storageWrite } from "@/lib/storage";
import { consommerCreneau } from "@/lib/rate-limit";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const EXT_PAR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const MAX_SIZE = 8 * 1024 * 1024; // 8 Mo — cohérent avec les autres uploads

export async function POST(req: Request) {
  // Garde-fou anti-abus : cette route sert aussi le paiement public (sans
  // session) — rate-limit IP obligatoire, réponse 429 si épuisé.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  const restants = consommerCreneau(`virement-preuve:${ip}`, 30, 15 * 60 * 1000);
  if (restants === 0) {
    return NextResponse.json(
      { error: "Trop d'envois récents, réessayez dans quelques minutes." },
      { status: 429 },
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const paymentId = String(form.get("paymentId") ?? "").trim();
  const file = form.get("fichier");

  if (!paymentId) return NextResponse.json({ error: "Référence de paiement manquante." }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Veuillez sélectionner une preuve." }, { status: 400 });
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json({ error: "Format non supporté (JPEG, PNG, WebP ou PDF)." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Fichier trop volumineux (maximum 8 Mo)." }, { status: 400 });
  }

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return NextResponse.json({ error: "Paiement introuvable." }, { status: 404 });
  if (payment.status !== "PENDING_VIREMENT") {
    return NextResponse.json({ error: "Ce paiement n'est plus en attente de virement." }, { status: 409 });
  }
  // Si une session existe, elle doit appartenir au paiement (anti-écriture
  // sur le paiement d'autrui). Sans session (parcours /paiement public), le
  // paymentId cuid non devinable fait office de capacité, avec le rate-limit
  // IP ci-dessus.
  const session = await auth();
  if (session?.user?.id && payment.userId !== session.user.id) {
    return NextResponse.json({ error: "Paiement non appartenant à votre compte." }, { status: 403 });
  }

  // Extension dérivée du MIME validé (jamais du nom de fichier client).
  const ext = EXT_PAR_MIME[file.type];
  const safeName = `preuves-virement/${paymentId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await storageWrite(safeName, buffer);

  // L'ancienne preuve éventuelle est supprimée du stockage (best-effort).
  if (payment.preuveUrl) await storageDelete(payment.preuveUrl).catch(() => null);

  await prisma.payment.update({
    where: { id: paymentId },
    data: { preuveUrl: url, preuveNom: file.name, preuveUploadedAt: new Date() },
  });

  return NextResponse.json({ ok: true, nom: file.name });
}

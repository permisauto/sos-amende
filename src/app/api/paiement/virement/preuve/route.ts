import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { storageWrite } from "@/lib/storage";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 8 * 1024 * 1024; // 8 Mo — cohérent avec les autres uploads

export async function POST(req: Request) {
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

  const ext = (file.name.split(".").pop() ?? "jpg").replace(/[^a-z0-9]/gi, "");
  const safeName = `preuves-virement/${paymentId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await storageWrite(safeName, buffer);

  await prisma.payment.update({
    where: { id: paymentId },
    data: { preuveUrl: url, preuveNom: file.name, preuveUploadedAt: new Date() },
  });

  return NextResponse.json({ ok: true, nom: file.name });
}
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

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

  // Crée ou récupère l'utilisateur, puis Payment PENDING_VIREMENT
  const user = await prisma.user.upsert({
    where: { email },
    update: { name: `${prenom} ${nom}` },
    create: { email, name: `${prenom} ${nom}`, credits: 0 },
  });

  // Si dossierId fourni et appartient à l'utilisateur, on y attache le contact
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

  return NextResponse.json({ ok: true, ref: payment.id.slice(0, 8).toUpperCase(), paymentId: payment.id });
}

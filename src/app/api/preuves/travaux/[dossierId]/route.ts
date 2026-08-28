import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dossierId: string }> }
) {
  try {
    const { dossierId } = await params;
    const body = (await request.json()) as {
      travauxPresent?: boolean;
      description?: string;
      dateDebutFin?: string;
    };
    const { travauxPresent, description, dateDebutFin } = body;

    if (travauxPresent === undefined) {
      return NextResponse.json({ error: "Le champ travauxPresent est requis" }, { status: 400 });
    }

    await prisma.dossier.update({
      where: { id: dossierId },
      data: { travaux_présents: travauxPresent },
    });

    await prisma.preuve.create({
      data: {
        dossierId,
        nom: "Travaux routiers",
        type: "TRAVAUX",
        url: "",
      },
    });

    return NextResponse.json({ stocke: true, travauxPresent, description, dateDebutFin });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ dossierId: string }> }
) {
  try {
    const { dossierId } = await params;
    const dossier = await prisma.dossier.findUnique({
      where: { id: dossierId },
      select: { travaux_présents: true },
    });
    if (!dossier) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
    return NextResponse.json({ travaux_présents: dossier.travaux_présents });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireJuriste } from "@/lib/dal";
import { apiErrorMessage } from "@/lib/api-helpers";

/**
 * Vérifie l'accès à un dossier : client propriétaire OU juriste.
 * Retourne un statut HTTP (200 = accès OK) sans lever NEXT_REDIRECT,
 * qui n'est pas gérable proprement dans une route API.
 */
async function verifierAcces(dossierId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  const dossier = await prisma.dossier.findFirst({
    where: { id: dossierId, userId: user.id },
  });
  if (dossier) return true;
  const juriste = await requireJuriste().catch(() => null);
  return !!juriste;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dossierId: string }> }
) {
  const { dossierId } = await params;
  let acces = false;
  try {
    acces = await verifierAcces(dossierId);
  } catch {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!acces) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
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
    return NextResponse.json({ error: apiErrorMessage(err) }, { status: 500 });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ dossierId: string }> }
) {
  const { dossierId } = await params;
  let acces = false;
  try {
    acces = await verifierAcces(dossierId);
  } catch {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!acces) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const dossier = await prisma.dossier.findUnique({
      where: { id: dossierId },
      select: { travaux_présents: true },
    });
    if (!dossier) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
    return NextResponse.json({ travaux_présents: dossier.travaux_présents });
  } catch (err: unknown) {
    return NextResponse.json({ error: apiErrorMessage(err) }, { status: 500 });
  }
}

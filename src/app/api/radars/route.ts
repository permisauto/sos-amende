import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { apiErrorMessage } from "@/lib/api-helpers";

async function estAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === "ADMIN";
}

/**
 * Lecture de toutes les calibrations radar (admin uniquement).
 */
export async function GET() {
  if (!(await estAdmin())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const calibrations = await prisma.radarCalibration.findMany({
      orderBy: { dateExpiration: "desc" },
    });
    return NextResponse.json(calibrations);
  } catch (err: unknown) {
    return NextResponse.json({ error: apiErrorMessage(err) }, { status: 500 });
  }
}

/**
 * Upsert d'une calibration radar (admin uniquement).
 */
export async function POST(request: NextRequest) {
  if (!(await estAdmin())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as {
      radarId?: string;
      dateExpiration?: string;
      date_dernier_renouvellement?: string | null;
      etat_certificat?: string | null;
      preuveUrl?: string | null;
    };
    const { radarId, dateExpiration, date_dernier_renouvellement, etat_certificat, preuveUrl } = body;

    if (!radarId || !dateExpiration) {
      return NextResponse.json({ error: "radarId et dateExpiration requis" }, { status: 400 });
    }

    const calibration = await prisma.radarCalibration.upsert({
      where: { radarId },
      update: {
        dateExpiration: new Date(dateExpiration),
        date_dernier_renouvellement: date_dernier_renouvellement ? new Date(date_dernier_renouvellement) : null,
        etat_certificat: etat_certificat ?? null,
        preuveUrl: preuveUrl ?? "",
      },
      create: {
        radarId,
        dateExpiration: new Date(dateExpiration),
        date_dernier_renouvellement: date_dernier_renouvellement ? new Date(date_dernier_renouvellement) : null,
        etat_certificat: etat_certificat ?? null,
        preuveUrl: preuveUrl ?? "",
      },
    });

    return NextResponse.json(calibration);
  } catch (err: unknown) {
    return NextResponse.json({ error: apiErrorMessage(err) }, { status: 500 });
  }
}

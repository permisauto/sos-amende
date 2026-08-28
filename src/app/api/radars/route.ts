import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const calibrations = await prisma.radarCalibration.findMany({
      orderBy: { dateExpiration: "desc" },
    });
    return NextResponse.json(calibrations);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

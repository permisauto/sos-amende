import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { apiErrorMessage } from "@/lib/api-helpers";

async function estAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === "ADMIN";
}

/**
 * Recherche cinémomètres homologués sur data.gouv.fr
 * Dataset: cinemometres-homologues (data.gouv.fr)
 */
async function searchRadarsDataGouv(query: string) {
  try {
    const url = `https://data.gouv.fr/api/1/datasets/cinemometres-homologues/records?rows=50&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`data.gouv.fr error ${res.status}`);
    const data = await res.json();

    type RecordDataGouv = { fields?: Record<string, unknown> };
    const records = ((data.records as RecordDataGouv[] | undefined) ?? [])
      .map((r) => ({
        radarId:
          (r.fields?.numero_homologation as string | undefined) ||
          (r.fields?.numero_homologation_cinemometre as string | undefined),
        marque: r.fields?.marque,
        modele: r.fields?.modele,
        type: r.fields?.type_cinemometre,
        dateHomologation: r.fields?.date_homologation,
        organisme: r.fields?.organisme_homologateur,
        statut: r.fields?.statut,
        source: "data.gouv.fr",
      }))
      .filter((r) => r.radarId);

    return NextResponse.json({ records, total: records.length });
  } catch (err: unknown) {
    console.error("Erreur recherche data.gouv.fr:", err);
    return NextResponse.json({ error: "Erreur recherche data.gouv.fr" }, { status: 500 });
  }
}

/**
 * Lecture de toutes les calibrations radar (admin uniquement).
 */
export async function GET(request: NextRequest) {
  if (!(await estAdmin())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    if (search) {
      return await searchRadarsDataGouv(search);
    }

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
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireJuriste } from "@/lib/dal";
import { apiErrorMessage } from "@/lib/api-helpers";

const TRAVAUX_PRESENTS_FIELD = "travaux_présents";

interface TravauxRecord {
  type: "TRAVAUX";
  dataset: string;
  titre: string | undefined;
  description: string | undefined;
  localisation: string | undefined;
  commune: string | undefined;
  departement: string | undefined;
  dateDebut: string | undefined;
  dateFin: string | undefined;
  dateDebutPrevue: string | undefined;
  dateFinPrevue: string | undefined;
  typeTravaux: string | undefined;
  maitreOuvrage: string | undefined;
  entreprise: string | undefined;
  statut: string | undefined;
  impactCirculation: string | undefined;
  voie: string | undefined;
  prDebut: string | number | undefined;
  prFin: string | number | undefined;
  source: string;
  url: string | undefined;
}

async function searchTravauxDataGouv(query: string, lat?: number, lon?: number, radiusKm = 10) {
  try {
    const datasets = [
      "chantiers-autoroutes",
      "chantiers-routes-nationales",
      "travaux-routiers"
    ];

    const allRecords: TravauxRecord[] = [];

    for (const dataset of datasets) {
      try {
        let url = `https://data.gouv.fr/api/1/datasets/${encodeURIComponent(dataset)}/records?rows=50`;
        if (lat !== undefined && lon !== undefined) {
          url += `&geofilter.distance=${lat},${lon},${radiusKm * 1000}`;
        }

        const res = await fetch(url, {
          headers: { Accept: "application/json" }
        });

        if (!res.ok) continue;

        const data = await res.json();

        if (data.records) {
          const records = data.records.map((r: { fields?: Record<string, unknown> }) => ({
            type: "TRAVAUX" as const,
            dataset,
            titre: (r.fields?.titre as string) || (r.fields?.titre_chantier as string) || (r.fields?.nom_chantier as string) || (r.fields?.intitule as string),
            description: (r.fields?.description as string) || (r.fields?.description_chantier as string) || (r.fields?.details as string),
            localisation: (r.fields?.localisation as string) || (r.fields?.adresse as string) || (r.fields?.commune as string) || (r.fields?.localisation_chantier as string),
            commune: (r.fields?.commune as string) || (r.fields?.ville as string),
            departement: (r.fields?.departement as string) || (r.fields?.code_departement as string),
            dateDebut: (r.fields?.date_debut as string) || (r.fields?.date_debut_chantier as string),
            dateFin: (r.fields?.date_fin as string) || (r.fields?.date_fin_chantier as string),
            dateDebutPrevue: r.fields?.date_debut_prevue as string | undefined,
            dateFinPrevue: r.fields?.date_fin_prevue as string | undefined,
            typeTravaux: (r.fields?.type_travaux as string) || (r.fields?.nature_travaux as string),
            maitreOuvrage: (r.fields?.maitre_ouvrage as string) || (r.fields?.maitre_ouvrage_delegue as string),
            entreprise: (r.fields?.entreprise as string) || (r.fields?.entreprise_titulaire as string),
            statut: (r.fields?.statut as string) || (r.fields?.etat_avancement as string),
            impactCirculation: (r.fields?.impact_circulation as string) || (r.fields?.perturbation_circulation as string),
            voie: (r.fields?.voie as string) || (r.fields?.route as string) || (r.fields?.axe as string),
            prDebut: r.fields?.pr_debut as string | number | undefined,
            prFin: r.fields?.pr_fin as string | number | undefined,
            source: `data.gouv.fr (${dataset})`,
            url: (r.fields?.url as string) || (r.fields?.lien as string) || (r.fields?.lien_fiche as string),
          })).filter((r: TravauxRecord) => r.titre || r.description || r.localisation);

          allRecords.push(...records);
        }
      } catch (err) {
        console.error(`Erreur dataset ${dataset}:`, err);
      }
    }

    return allRecords;
  } catch (err) {
    console.error("Erreur recherche data.gouv.fr travaux:", err);
    return [];
  }
}

async function searchTravauxNearby(params: {
  query?: string;
  lat?: number;
  lon?: number;
  radiusKm?: number;
}) {
  try {
    const { query, lat, lon, radiusKm = 10 } = params;

    if (lat !== undefined && lon !== undefined) {
      return searchTravauxDataGouv("", lat, lon, radiusKm);
    }

    if (query) {
      return searchTravauxDataGouv(query);
    }

    return [];
  } catch (err) {
    console.error("Erreur searchTravauxNearby:", err);
    return [];
  }
}

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
      searchNearby?: boolean;
      latitude?: number;
      longitude?: number;
      radiusKm?: number;
    };
    const { travauxPresent, description, dateDebutFin, searchNearby, latitude, longitude } = body;

    if (travauxPresent === undefined) {
      return NextResponse.json({ error: "Le champ travauxPresent est requis" }, { status: 400 });
    }

    let travauxAuto = null;
    if (searchNearby && typeof latitude === "number" && typeof longitude === "number") {
      const travauxProches = await searchTravauxNearby({
        lat: latitude,
        lon: longitude,
        radiusKm: 10
      });
      if (travauxProches.length > 0) {
        travauxAuto = travauxProches[0];
      }
    }

    await prisma.dossier.update({
      where: { id: dossierId },
      data: { [TRAVAUX_PRESENTS_FIELD]: travauxPresent },
    });

    await prisma.preuve.create({
      data: {
        dossierId,
        nom: "Travaux routiers",
        type: "TRAVAUX",
        url: "",
      },
    });

    if (travauxAuto) {
      await prisma.preuve.create({
        data: {
          dossierId,
          nom: `Travaux détectés: ${travauxAuto.titre || "Travaux routiers"}`,
          type: "TRAVAUX",
          url: travauxAuto.url || "",
        },
      });
    }

    return NextResponse.json({
      stocke: true,
      travauxPresent,
      description,
      dateDebutFin,
      autoDetected: !!travauxAuto,
      travauxDetecte: travauxAuto
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: apiErrorMessage(err) }, { status: 500 });
  }
}

export async function GET(
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

  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  const radiusParam = searchParams.get("radius");
  const query = searchParams.get("query");

  if (lat && lon) {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    const radiusKm = radiusParam ? parseInt(radiusParam) : 10;

    if (!isNaN(latNum) && !isNaN(lonNum)) {
      const travaux = await searchTravauxDataGouv("", latNum, lonNum, radiusKm);
      return NextResponse.json({ travaux, total: travaux.length });
    }
  }

  if (query) {
    const travaux = await searchTravauxDataGouv(query);
    return NextResponse.json({ travaux, total: travaux.length });
  }

  let acces2 = false;
  try {
    acces2 = await verifierAcces(dossierId);
  } catch {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!acces2) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

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
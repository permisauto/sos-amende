import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireJuriste } from "@/lib/dal";
import { apiErrorMessage } from "@/lib/api-helpers";

const OPENMETEO_HISTORICAL_ENDPOINT = "https://archive-api.open-meteo.com/v1/archive";

function summariseMeteoHistorical(data: unknown): string | null {
  const d = data as {
    daily?: {
      weathercode?: number[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_sum?: number[];
      rain_sum?: number[];
      snowfall_sum?: number[];
      windspeed_10m_max?: number[];
      windgusts_10m_max?: number[];
    };
  };

  if (!d?.daily?.weathercode?.length) return null;

  const idx = 0; // premier jour (date demandée)
  const code = d.daily.weathercode?.[idx];
  const tempMax = d.daily.temperature_2m_max?.[idx];
  const tempMin = d.daily.temperature_2m_min?.[idx];
  const precip = d.daily.precipitation_sum?.[idx] ?? 0;
  const rain = d.daily.rain_sum?.[idx] ?? 0;
  const snow = d.daily.snowfall_sum?.[idx] ?? 0;
  const windMax = d.daily.windspeed_10m_max?.[idx];
  const gustMax = d.daily.windgusts_10m_max?.[idx];

  // Codes météo WMO
  const weatherCodes: Record<number, string> = {
    0: "Ciel dégagé",
    1: "Principalement clair",
    2: "Partiellement nuageux",
    3: "Couvert",
    45: "Brouillard",
    48: "Brouillard givrant",
    51: "Bruine légère",
    53: "Bruine modérée",
    55: "Bruine dense",
    56: "Bruine verglaçante légère",
    57: "Bruine verglaçante dense",
    61: "Pluie légère",
    63: "Pluie modérée",
    65: "Pluie forte",
    66: "Pluie verglaçante légère",
    67: "Pluie verglaçante forte",
    71: "Neige légère",
    73: "Neige modérée",
    75: "Neige forte",
    77: "Grains de neige",
    80: "Averses de pluie légères",
    81: "Averses de pluie modérées",
    82: "Averses de pluie violentes",
    85: "Averses de neige légères",
    86: "Averses de neige fortes",
    95: "Orages",
    96: "Orages avec grêle légère",
    99: "Orages avec grêle forte",
  };

  const desc = weatherCodes[code ?? -1] ?? `Code météo ${code}`;
  const parts = [desc];

  if (tempMax !== undefined && tempMin !== undefined) {
    parts.push(`${Math.round(tempMin)}°/${Math.round(tempMax)}°C`);
  }
  if (precip > 0) parts.push(`Précip: ${precip} mm`);
  if (rain > 0) parts.push(`Pluie: ${rain} mm`);
  if (snow > 0) parts.push(`Neige: ${snow} mm`);
  if (windMax) parts.push(`Vent: ${Math.round(windMax)} km/h`);
  if (gustMax) parts.push(`Rafales: ${Math.round(gustMax)} km/h`);

  return parts.join(" • ");
}

/**
 * Vérifie l'accès à un dossier : client propriétaire OU juriste.
 * Retourne un booléen sans lever NEXT_REDIRECT (pas gérable en route API).
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
      latitude?: number;
      longitude?: number;
      date?: string; // ISO yyyy-mm-dd (date de l'infraction)
    };
    const { latitude, longitude, date } = body;

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return NextResponse.json({ error: "latitude et longitude requis" }, { status: 400 });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date requise (format ISO yyyy-mm-dd)" }, { status: 400 });
    }

    // Appel Open-Meteo Historical API
    const url = `${OPENMETEO_HISTORICAL_ENDPOINT}?latitude=${latitude}&longitude=${longitude}&start_date=${date}&end_date=${date}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,snowfall_sum,windspeed_10m_max,windgusts_10m_max&timezone=Europe/Paris`;
    const omRes = await fetch(url);
    if (!omRes.ok) throw new Error(`Open-Meteo error ${omRes.status}`);
    const omData = await omRes.json();

    const resume = summariseMeteoHistorical(omRes);

    await prisma.$transaction(async (tx) => {
      await tx.dossier.update({
        where: { id: dossierId },
        data: { conditions_meteo: resume },
      });
      await tx.preuve.create({
        data: {
          dossierId,
          nom: "Bulletin météo historique",
          type: "METEO",
          url: "",
        },
      });
    });

    return NextResponse.json({ resume, stocke: true, date });
  } catch (err: unknown) {
    console.error("/api/preuves/meteo POST error", err);
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
      select: { conditions_meteo: true },
    });
    if (!dossier) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
    return NextResponse.json({ conditions_meteo: dossier.conditions_meteo });
  } catch (err: unknown) {
    return NextResponse.json({ error: apiErrorMessage(err) }, { status: 500 });
  }
}
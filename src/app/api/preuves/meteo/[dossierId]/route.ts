import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const OWM_API_KEY = process.env.OPENWEATHER_API_KEY;
const OWM_ENDPOINT = "https://api.openweathermap.org/data/2.5/weather";

function summariseMeteo(data: unknown): string | null {
  const d = data as {
    weather?: { description: string }[];
    main?: { temp: number };
    rain?: Record<string, number>;
    snow?: Record<string, number>;
  };
  if (!d?.weather?.length) return null;
  const desc = (d.weather[0].description ?? "").toLowerCase();
  if ((d.rain?.["1h"] ?? 0) > 0) return `Pluie ${d.rain?.["1h"]} mm`;
  if ((d.snow?.["1h"] ?? 0) > 0) return `Neige ${d.snow?.["1h"]} mm`;
  if (desc.includes("clear")) return "Ciel dégagé";
  if (desc.includes("cloud")) return "Couvert";
  if (desc.includes("storm") || desc.includes("tempête")) return "Orages";
  if (desc.includes("drizzle")) return "Bruine";
  return d.weather[0].description ?? null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dossierId: string }> }
) {
  try {
    const { dossierId } = await params;
    const body = (await request.json()) as {
      latitude?: number;
      longitude?: number;
    };

    const { latitude, longitude } = body;

    if (!OWM_API_KEY) {
      return NextResponse.json({ error: "Clé OpenWeatherMap non configurée" }, { status: 500 });
    }
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return NextResponse.json({ error: "latitude et longitude requis" }, { status: 400 });
    }

    const url = `${OWM_ENDPOINT}?lat=${latitude}&lon=${longitude}&appid=${OWM_API_KEY}&units=metric&lang=fr`;
    const owmRes = await fetch(url);
    if (!owmRes.ok) throw new Error("Erreur météo API");

    const owmData = await owmRes.json();
    const resume = summariseMeteo(owmData);

    await prisma.$transaction(async (tx) => {
      await tx.dossier.update({
        where: { id: dossierId },
        data: { conditions_meteo: resume },
      });
      await tx.preuve.create({
        data: {
          dossierId,
          nom: "Bulletin météo",
          type: "METEO",
          url: "",
        },
      });
    });

    return NextResponse.json({ resume, stocke: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("/api/preuves/meteo POST error", err);
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
      select: { conditions_meteo: true },
    });
    if (!dossier) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
    return NextResponse.json({ conditions_meteo: dossier.conditions_meteo });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

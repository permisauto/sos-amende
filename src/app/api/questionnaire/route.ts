import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { questionsDepuisFailles } from "@/lib/questionnaire";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") === "SUSPENSION" ? "SUSPENSION" : "AMENDE";

  try {
    const failles = await prisma.failleJuridique.findMany({
      where: { typeInfraction: type, statut: "ACTIVE" },
      select: { id: true, titreFaille: true, articleLoi: true, regle: true, reglesDetection: true },
    });
    const questions = questionsDepuisFailles(failles as never);
    return NextResponse.json({ type, count: questions.length, questions });
  } catch (e) {
    console.error("questionnaire: DB indisponible, fallback", e);
    // Fallback statique si DB down — 8 questions de base
    const { questionsDepuisFailles: q } = await import("@/lib/questionnaire");
    const fallback = q([]);
    return NextResponse.json({ type, count: fallback.length, questions: fallback, fallback: true });
  }
}

import { prisma } from "@/lib/prisma";
import { requireJuriste } from "@/lib/dal";
import { extraireDispositif } from "@/lib/veille-texte";

/**
 * Lecture côte à côté (lot M) : texte complet d'une publication de la veille,
 * chargé **à la demande** depuis le drawer (le `contenu`, souvent 7 à 16 ko,
 * ne circule jamais dans le DTO de la liste des cartes).
 *
 * `dispositif` = passage « ORDONNE/DÉCIDE/ARRÊTE : » extrait localement
 * (jamais d'IA) ; `null` → l'interface affiche le texte intégral.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireJuriste();
  const { id } = await params;
  const source = await prisma.sourceJuridique.findUnique({
    where: { id },
    select: { contenu: true },
  });
  if (!source) {
    return Response.json({ error: "Publication introuvable" }, { status: 404 });
  }
  const contenu = source.contenu ?? "";
  return Response.json({
    contenu,
    dispositif: extraireDispositif(contenu),
  });
}

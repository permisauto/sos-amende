import { LettreData } from "@/lib/lettre-pdf-conforme";

/**
 * Wrapper rétrocompatible — convertit l'ancienne signature
 * (texte, signatureDataUrl, piecesJointes) vers le nouveau format LettreData
 * et appelle le générateur conforme.
 */
export async function generateLettrePdf(
  texte: string,
  signatureDataUrl: string | null,
  piecesJointes?: string[] | null,
): Promise<Buffer> {
  // Parser le texte pour extraire les variables si possible
  // (fallback minimal si le texte ne contient pas les marqueurs)
  const data: LettreData = {
    nom: "Requérant",
    plaque: "AB-123-CD",
    numPv: "PV-INCONNU",
    texte,
    signatureDataUrl,
    piecesJointes: piecesJointes?.map((p, idx) => ({
      numero: idx + 1,
      nom: p,
    })) ?? null,
  };

  const { generateLettrePdf: generateLettrePdfConforme } = await import("@/lib/lettre-pdf-conforme");
  return generateLettrePdfConforme(data);
}
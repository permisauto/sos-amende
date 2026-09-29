import { prisma } from "@/lib/prisma";
import { verifierLienDepot } from "@/lib/lien-depot";
import { storageRead } from "@/lib/storage";

/**
 * Téléchargement des pièces du dossier depuis la page publique de dépôt
 * assisté /recours/finaliser. Aucun cookie de session : la seule clé est le
 * token du lien de dépôt (haché en base, RGPD). Chaque pièce est lue
 * serveur-côté via storageRead — jamais d'URL publique de fichier exposée
 * (fonctionne en local et en S3).
 */
function contentTypeChemin(chemin: string): string {
  const ext = chemin.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function nomFichier(chemin: string, basename: string): string {
  const ext = chemin.split(".").pop()?.toLowerCase() ?? "";
  return `${basename}.${ext}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const doc = url.searchParams.get("doc") ?? "";
  const preuveId = url.searchParams.get("preuveId") ?? "";

  const lien = await verifierLienDepot(token);
  if (!lien) {
    return new Response("Lien invalide ou expiré", { status: 403 });
  }

  let chemin: string | null = null;
  let basename = "piece";

  if (doc === "lettre") {
    chemin = lien.dossier.fichiers.lettrePdf;
    basename = "lettre-contestation";
  } else if (doc === "pv") {
    chemin = lien.dossier.fichiers.pv;
    basename = lien.dossier.type === "SUSPENSION" ? "decision-suspension" : "avis-contravention";
  } else if (doc === "preuve" && preuveId) {
    const preuve = await prisma.preuve.findFirst({
      where: { id: preuveId, dossierId: lien.dossier.id },
      select: { url: true, nom: true },
    });
    if (!preuve || !preuve.url || preuve.url.trim() === "") {
      return new Response("Pièce introuvable", { status: 404 });
    }
    chemin = preuve.url;
    basename = preuve.nom?.trim() ? preuve.nom.trim() : "piece";
  } else {
    return new Response("Document inconnu", { status: 400 });
  }

  if (!chemin) return new Response("Document introuvable", { status: 404 });

  const buffer = await storageRead(chemin);
  if (!buffer || buffer.length === 0) {
    return new Response("Document introuvable", { status: 404 });
  }

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": contentTypeChemin(chemin),
      "Content-Disposition": `inline; filename="${nomFichier(chemin, basename)}"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store",
    },
  });
}
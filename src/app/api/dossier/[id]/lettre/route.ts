import { prisma } from "@/lib/prisma";
import { requireJuriste } from "@/lib/dal";
import { generateLettrePdf } from "@/lib/lettre-pdf";
import { storageRead } from "@/lib/storage";
import { getDemoLettre } from "@/lib/demo-lettres";
import { lirePiecesJointesPourDossierId } from "@/lib/preuves-api";

async function buildPdf(
  id: string,
  overrideLettre?: string | null,
): Promise<{ lettre: string | null; signatureDataUrl: string | null; piecesJointes: string[] }> {
  const demoLettre = getDemoLettre(id);
  let lettre: string | null = overrideLettre ?? demoLettre ?? null;
  let signatureDataUrl: string | null = null;
  let piecesJointes: string[] = [];

  const dossier = await prisma.dossier.findUnique({
    where: { id },
    include: { courriers: { orderBy: { createdAt: "asc" } } },
  });

  if (dossier?.lettreGeneree) {
    // Dossier réel : la lettre postée (aperçu modifié) prime, sinon la lettre
    // en base. La signature du dernier courrier est TOUJOURS relue — y compris
    // quand un aperçu (overrideLettre) est demandé, car le PDF doit rester
    // fidèle à l'écran (signature au bas de la lettre).
    lettre = overrideLettre ?? dossier.lettreGeneree;
    piecesJointes = await lirePiecesJointesPourDossierId(prisma, id);
    const courrier = dossier.courriers[dossier.courriers.length - 1];
    if (courrier?.signatureUrl) {
      try {
        const sig = await storageRead(courrier.signatureUrl);
        if (sig) signatureDataUrl = `data:image/png;base64,${sig.toString("base64")}`;
      } catch {}
    }
  } else if (demoLettre) {
    // Lettre démo mémorisée (aucun dossier en base) : signature démo jointe.
    try {
      const sig = await storageRead("/uploads/demo-signature.png");
      if (sig) signatureDataUrl = `data:image/png;base64,${sig.toString("base64")}`;
    } catch {}
  }

  return { lettre, signatureDataUrl, piecesJointes };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireJuriste();
  const { id } = await params;
  const { lettre, signatureDataUrl, piecesJointes } = await buildPdf(id);
  if (!lettre) return new Response("Lettre introuvable", { status: 404 });
  const pdf = await generateLettrePdf(lettre, signatureDataUrl, piecesJointes);
  return new Response(Buffer.from(pdf) as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="lettre-${id}.pdf"`,
      "Content-Length": String(pdf.length),
    },
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireJuriste();
  const { id } = await params;
  let override: string | null = null;
  try {
    const body = (await req.json()) as { lettre?: string };
    if (typeof body.lettre === "string" && body.lettre.trim().length >= 10) override = body.lettre.trim();
  } catch {}
  const { lettre, signatureDataUrl, piecesJointes } = await buildPdf(id, override);
  if (!lettre) return new Response("Lettre introuvable", { status: 404 });
  const pdf = await generateLettrePdf(lettre, signatureDataUrl, piecesJointes);
  return new Response(Buffer.from(pdf) as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="lettre-${id}.pdf"`,
      "Content-Length": String(pdf.length),
    },
  });
}

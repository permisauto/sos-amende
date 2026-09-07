import { prisma } from "@/lib/prisma";
import { requireJuriste } from "@/lib/dal";
import { generateLettrePdf } from "@/lib/lettre-pdf";
import { storageRead } from "@/lib/storage";
import { getDemoLettre } from "@/lib/demo-lettres";

async function buildPdf(id: string, overrideLettre?: string | null): Promise<{ lettre: string | null; signatureDataUrl: string | null }> {
  let lettre: string | null = overrideLettre ?? null;
  let signatureDataUrl: string | null = null;

  const demoLettre = getDemoLettre(id);
  if (demoLettre || overrideLettre) {
    // Priorité : lettre postée (aperçu), sinon lettre démo mémorisée
    lettre = overrideLettre ?? demoLettre ?? null;
    try {
      const sig = await storageRead("/uploads/demo-signature.png");
      if (sig) signatureDataUrl = `data:image/png;base64,${sig.toString("base64")}`;
    } catch {}
    if (lettre) return { lettre, signatureDataUrl };
  }

  const dossier = await prisma.dossier.findUnique({
    where: { id },
    include: { courriers: { orderBy: { createdAt: "asc" } } },
  });
  if (!dossier?.lettreGeneree) return { lettre: null, signatureDataUrl: null };
  lettre = overrideLettre ?? dossier.lettreGeneree;
  const courrier = dossier.courriers[dossier.courriers.length - 1];
  if (courrier?.signatureUrl) {
    try {
      const sig = await storageRead(courrier.signatureUrl);
      if (sig) signatureDataUrl = `data:image/png;base64,${sig.toString("base64")}`;
    } catch {}
  }
  return { lettre, signatureDataUrl };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireJuriste();
  const { id } = await params;
  const { lettre, signatureDataUrl } = await buildPdf(id);
  if (!lettre) return new Response("Lettre introuvable", { status: 404 });
  const pdf = await generateLettrePdf(lettre, signatureDataUrl);
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
  const { lettre, signatureDataUrl } = await buildPdf(id, override);
  if (!lettre) return new Response("Lettre introuvable", { status: 404 });
  const pdf = await generateLettrePdf(lettre, signatureDataUrl);
  return new Response(Buffer.from(pdf) as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="lettre-${id}.pdf"`,
      "Content-Length": String(pdf.length),
    },
  });
}

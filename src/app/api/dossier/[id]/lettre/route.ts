import { prisma } from "@/lib/prisma";
import { requireJuriste } from "@/lib/dal";
import { generateLettrePdf } from "@/lib/lettre-pdf";
import { storageRead } from "@/lib/storage";
import { getDemoLettre } from "@/lib/demo-lettres";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireJuriste();
  const { id } = await params;

  let lettre: string | null = null;
  let signatureDataUrl: string | null = null;

  const demoLettre = getDemoLettre(id);
  if (demoLettre) {
    lettre = demoLettre;
    // Signature de démo si disponible
    try {
      const sig = await storageRead("/uploads/demo-signature.png");
      if (sig) signatureDataUrl = `data:image/png;base64,${sig.toString("base64")}`;
    } catch {}
  } else {
    const dossier = await prisma.dossier.findUnique({
      where: { id },
      include: { courriers: { orderBy: { createdAt: "asc" } } },
    });
    if (!dossier?.lettreGeneree) {
      return new Response("Lettre introuvable", { status: 404 });
    }
    lettre = dossier.lettreGeneree;
    const courrier = dossier.courriers[dossier.courriers.length - 1];
    if (courrier?.signatureUrl) {
      try {
        const sig = await storageRead(courrier.signatureUrl);
        if (sig) signatureDataUrl = `data:image/png;base64,${sig.toString("base64")}`;
      } catch {}
    }
  }

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

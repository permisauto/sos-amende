import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { storageWrite } from "../src/lib/storage";
import { generateLettrePdf } from "../src/lib/lettre-pdf";

async function main() {
  const p = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const sigBuf = readFileSync(path.join(process.cwd(), "public", "uploads", "signatures", "signature-test.png"));
  const sigDataUrl = `data:image/png;base64,${sigBuf.toString("base64")}`;
  const sigKey = "signatures/signature-test.png";
  const sigUrl = await storageWrite(sigKey, sigBuf);

  // Dossiers avec lettre signée (PRET / ENVOYE / RESOLU) : régénère PDF avec vraie signature
  const dossiers = await p.dossier.findMany({
    where: { statut: { in: ["PRET", "ENVOYE", "RESOLU"] } },
    include: { courriers: true },
  });

  for (const d of dossiers) {
    if (!d.lettreGeneree) continue;
    const pdfBuffer = await generateLettrePdf(d.lettreGeneree, sigDataUrl);
    const pdfKey = `pdfs/lettre-${d.id}.pdf`;
    const pdfUrl = await storageWrite(pdfKey, Buffer.from(pdfBuffer));

    if (d.courriers.length > 0) {
      await p.courrier.update({
        where: { id: d.courriers[0].id },
        data: { pdfUrl, signatureUrl: sigUrl },
      });
    } else {
      await p.courrier.create({ data: { dossierId: d.id, pdfUrl, signatureUrl: sigUrl } });
    }
    console.log("PDF régénéré:", d.id, "(STATUT", d.statut + ")", pdfUrl);
  }

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
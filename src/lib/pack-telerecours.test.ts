import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractedData } from "@/lib/moteur";

vi.mock("@/lib/storage", () => ({
  storageWrite: vi.fn(async (key: string) => `/uploads/${key}`),
  storageRead: vi.fn(),
  storageUrl: vi.fn(async (raw: string | null) => raw),
  storageDelete: vi.fn(async () => undefined),
}));
vi.mock("@/lib/lettre-pdf", () => ({
  generateLettrePdf: vi.fn(async () => Buffer.from("pdf")),
}));

import { storageWrite } from "@/lib/storage";
import { generateLettrePdf } from "@/lib/lettre-pdf";
import {
  estPackTelecours,
  genererPackTelecours,
  texteBordereau,
} from "./pack-telerecours";

describe("estPackTelecours", () => {
  it("accepte SUSPENSION + TELEECOURS + 3F", () => {
    expect(
      estPackTelecours({ type: "SUSPENSION", canal: "TELERECOURS", docType: "3F" }),
    ).toBe(true);
  });
  it("accepte SUSPENSION + TELEECOURS + 48SI", () => {
    expect(
      estPackTelecours({ type: "SUSPENSION", canal: "TELERECOURS", docType: "48SI" }),
    ).toBe(true);
  });
  it("refuse une amende, le LRAR ou un document non classé", () => {
    expect(
      estPackTelecours({ type: "AMENDE", canal: "TELERECOURS", docType: "3F" }),
    ).toBe(false);
    expect(
      estPackTelecours({ type: "SUSPENSION", canal: "LRAR", docType: "3F" }),
    ).toBe(false);
    expect(
      estPackTelecours({ type: "SUSPENSION", canal: "TELERECOURS", docType: null }),
    ).toBe(false);
    expect(
      estPackTelecours({ type: "SUSPENSION", canal: "TELERECOURS", docType: "AUTRE" }),
    ).toBe(false);
    expect(
      estPackTelecours({ type: "SUSPENSION", canal: "TELERECOURS", docType: "AMENDE" }),
    ).toBe(false);
  });
});

describe("texteBordereau", () => {
  const opts = {
    numRef: "12345678901234",
    dateDecision: "2026-07-01",
    documents: [
      "Requête au fond (lettre de contestation) — signée",
      "Requête en référé-suspension (article L. 521-2 du code de justice administrative)",
      "Copie de la décision de suspension",
    ],
  };

  it("liste les documents réellement produits, numérotés", () => {
    const texte = texteBordereau(opts);
    expect(texte).toContain("BORDEREAU DES PIÈCES DU DÉPÔT");
    expect(texte).toContain("article L. 521-2 du code de justice administrative");
    expect(texte).toContain("Dossier n° 12345678901234");
    expect(texte).toContain("Décision contestée en date du 1er juillet 2026");
    expect(texte).toContain("1. Requête au fond (lettre de contestation) — signée");
    expect(texte).toContain(
      "2. Requête en référé-suspension (article L. 521-2 du code de justice administrative)",
    );
    expect(texte).toContain("3. Copie de la décision de suspension");
    expect(texte).toContain(
      "Les documents ci-dessus sont déposés ensemble : requête au fond, requête en référé-suspension et pièces.",
    );
  });

  it("n'affiche ni numéro ni date absents (jamais de donnée fabriquée)", () => {
    const texte = texteBordereau({ numRef: null, dateDecision: null, documents: ["A"] });
    expect(texte).not.toContain("Dossier n°");
    expect(texte).not.toContain("Décision contestée");
    expect(texte).toContain("1. A");
  });
});

describe("genererPackTelecours", () => {
  const data = {
    nom: "Alex Martin",
    plaque: "AB-123-CD",
    num_pv: "12345678901234",
    date: "2026-07-01",
    metier: "ambulancier",
    entreprise: "Ambulances du Perche",
    risque_licenciement: "a été suspendu avant la fin de son contrat de travail",
  } as ExtractedData;

  const base = {
    dossierId: "dos_1",
    lettreFinale: "Objet : recours\n\nMadame la Présidente,",
    data,
    piecesJointes: ["Copie de la décision de suspension"],
    signatureDataUrl: "data:image/png;base64,xxx",
    numRef: "12345678901234",
    dateDecision: "2026-07-01",
  };

  beforeEach(() => {
    vi.mocked(storageWrite).mockClear();
    vi.mocked(generateLettrePdf).mockClear();
  });

  it("produit requête + référé + bordereau quand la faille porte un template de référé", async () => {
    const templateRefere =
      "Madame la Présidente,\n\nUrgence : le demandeur exerce l'activité de {metier} pour la société {entreprise} et {risque_licenciement}.";
    const urls = await genererPackTelecours({ ...base, templateRefere });

    expect(urls.requete).toContain("pdfs/pack/dos_1/Requete_au_fond_REP.pdf");
    expect(urls.refere).toContain("pdfs/pack/dos_1/Requete_Refere_Suspension.pdf");
    expect(urls.bordereau).toContain(
      "pdfs/pack/dos_1/Bordereau_Recapitulatif_des_Pieces.pdf",
    );
    expect(storageWrite).toHaveBeenCalledTimes(3);

    // Requête = lettre finale, avec les pièces jointes listées.
    expect(generateLettrePdf).toHaveBeenCalledWith(
      base.lettreFinale,
      base.signatureDataUrl,
      base.piecesJointes,
    );
    // Référé = template de la faille rempli avec les données (variables urgence).
    const texteRefere = vi
      .mocked(generateLettrePdf)
      .mock.calls.map((c) => String(c[0]))
      .find((t) => t.startsWith("Madame la Présidente"));
    expect(texteRefere).toBeDefined();
    expect(texteRefere).toContain("l'activité de ambulancier");
    expect(texteRefere).not.toContain("{metier}");
    // Bordereau = inventaire des 3 documents, rendu sans pièce jointe.
    const appelsBord = vi
      .mocked(generateLettrePdf)
      .mock.calls.find((c) => String(c[0]).includes("BORDEREAU DES PIÈCES"));
    expect(appelsBord).toBeDefined();
    expect(String(appelsBord?.[0])).toContain("2. Requête en référé-suspension");
    expect(appelsBord?.[2]).toBeNull();
  });

  it("sans template de référé, le pack se limite à la requête et au bordereau", async () => {
    const urls = await genererPackTelecours({ ...base, templateRefere: null });
    expect(urls.requete).toContain("Requete_au_fond_REP.pdf");
    expect(urls.bordereau).toContain("Bordereau_Recapitulatif_des_Pieces.pdf");
    expect(urls.refere).toBeUndefined();
    expect(storageWrite).toHaveBeenCalledTimes(2);
    const texteBord = vi
      .mocked(generateLettrePdf)
      .mock.calls.map((c) => String(c[0]))
      .find((t) => t.includes("BORDEREAU DES PIÈCES"));
    // Aucun document fantôme : ni en-tête de référé, ni référé listé.
    expect(texteBord).not.toContain("référé");
    expect(texteBord).toContain("1. Requête au fond (lettre de contestation) — signée");
  });

  // ── Chantier 3 (2026-10-10) : urgence professionnelle → pack double ──
  it("urgence pro cochée sans templateRefere : référé de secours L. 521-2 généré", async () => {
    const urls = await genererPackTelecours({
      ...base,
      templateRefere: null,
      data: { ...data, urgencePro: true },
    });
    // Pack obligatoirement double : requête + référé + bordereau.
    expect(urls.refere).toContain("pdfs/pack/dos_1/Requete_Refere_Suspension.pdf");
    expect(storageWrite).toHaveBeenCalledTimes(3);
    const texteRefere = vi
      .mocked(generateLettrePdf)
      .mock.calls.map((c) => String(c[0]))
      .find((t) => t.includes("L'ARTICLE L. 521-2"));
    expect(texteRefere).toBeDefined();
    // Variables d'urgence remplies via ExtractedData.
    expect(texteRefere).toContain("ambulancier");
    expect(texteRefere).not.toContain("{metier}");
    expect(texteRefere).not.toContain("{siret}");
    // Bordereau listant bien les 3 documents.
    const texteBord = vi
      .mocked(generateLettrePdf)
      .mock.calls.map((c) => String(c[0]))
      .find((t) => t.includes("BORDEREAU DES PIÈCES"));
    expect(texteBord).toContain("2. Requête en référé-suspension");
  });

  it("templateRefere présent + urgence pro : le template de la faille prime", async () => {
    const templateRefere = "Madame la Présidente,\n\nUrgence : {metier}.";
    const urls = await genererPackTelecours({
      ...base,
      templateRefere,
      data: { ...data, urgencePro: true },
    });
    expect(urls.refere).toBeDefined();
    const texteRefere = vi
      .mocked(generateLettrePdf)
      .mock.calls.map((c) => String(c[0]))
      .find((t) => t.startsWith("Madame la Présidente"));
    expect(texteRefere).toBe("Madame la Présidente,\n\nUrgence : ambulancier.");
  });

  it("référé de secours sans urgencePro : jamais produit", async () => {
    const urls = await genererPackTelecours({ ...base, templateRefere: null });
    expect(urls.refere).toBeUndefined();
  });

  it("référé de secours : variables absentes effacées (nettoyerLettre)", async () => {
    const urls = await genererPackTelecours({
      ...base,
      templateRefere: null,
      data: {
        nom: "Sam Dupont",
        num_pv: "999",
        date: "2026-01-01",
        urgencePro: true,
        // metier/entreprise/siret/risque_licenciement absents.
      } as ExtractedData,
    });
    expect(urls.refere).toBeDefined();
    const texteRefere = vi
      .mocked(generateLettrePdf)
      .mock.calls.map((c) => String(c[0]))
      .find((t) => t.includes("L'ARTICLE L. 521-2"));
    expect(texteRefere).toBeDefined();
    expect(texteRefere).not.toContain("{metier}");
    expect(texteRefere).not.toContain("{entreprise}");
    expect(texteRefere).not.toContain("{siret}");
    expect(texteRefere).not.toContain("{risque_licenciement}");
    expect(texteRefere).toContain("Sam Dupont");
  });

  it("sans signature, la requête n'est pas annoncée comme signée", async () => {
    await genererPackTelecours({
      ...base,
      templateRefere: null,
      signatureDataUrl: null,
    });
    const texteBord = vi
      .mocked(generateLettrePdf)
      .mock.calls.map((c) => String(c[0]))
      .find((t) => t.includes("BORDEREAU DES PIÈCES"));
    expect(texteBord).toContain("1. Requête au fond (lettre de contestation)");
    expect(texteBord).not.toContain("— signée");
  });
});

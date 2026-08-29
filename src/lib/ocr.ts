import type { ExtractedData } from "@/lib/moteur";

export type OcrResult = {
  texte: string;
  confiance?: number;
};

export type OcrProvider = "google-vision" | "mistral-ocr" | "tesseract" | "mock" | "aucun";

export function getOcrProvider(): OcrProvider {
  const raw = (process.env.OCR_PROVIDER ?? "").toLowerCase();
  if (raw === "google-vision") {
    return process.env.GOOGLE_VISION_KEY ? "google-vision" : "aucun";
  }
  if (raw === "mistral-ocr") {
    // Mistral AI (hébergement UE) — alternative RGPD à Google Vision.
    return process.env.MISTRAL_API_KEY ? "mistral-ocr" : "aucun";
  }
  if (raw === "tesseract") return "tesseract";
  if (raw === "mock") return "mock";
  return "aucun";
}

/**
 * OCR de l'avis de contravention. Le résultat n'est JAMAIS envoyé tel quel :
 * il pré-remplit le formulaire d'analyse soumis par un humain (garde-fou
 * human-in-the-loop). Sans provider configuré, renvoie null.
 */
export async function extrairePv(buffer: Buffer): Promise<OcrResult | null> {
  const provider = getOcrProvider();
  if (provider === "google-vision") return googleVisionOcr(buffer);
  if (provider === "mistral-ocr") return mistralOcr(buffer);
  if (provider === "tesseract") return tesseractOcr(buffer);
  if (provider === "mock") return mockOcr();
  return null;
}

async function googleVisionOcr(buffer: Buffer): Promise<OcrResult | null> {
  try {
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          requests: [
            {
              image: { content: buffer.toString("base64") },
              features: [{ type: "TEXT_DETECTION" }],
            },
          ],
        }),
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      responses?: { textAnnotations?: { description?: string }[] }[];
    };
    const annotation = body.responses?.[0]?.textAnnotations?.[0];
    const texte = annotation?.description?.trim();
    if (!texte) return null;
    return { texte };
  } catch {
    return null;
  }
}

/**
 * OCR Mistral AI (api.mistral.ai) — alternative hébergée en UE (RGPD),
 * facturée par page. Envoie l'image en base64 (data URL) et concatène le
 * markdown des pages. Réf. : https://docs.mistral.ai/capabilities/document/.
 */
async function mistralOcr(buffer: Buffer): Promise<OcrResult | null> {
  try {
    const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
    const res = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
      },
      cache: "no-store",
      body: JSON.stringify({
        model: "mistral-ocr-latest",
        document: { type: "image_url", image_url: dataUrl },
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      pages?: { markdown?: string }[];
    };
    const texte = (body.pages ?? [])
      .map((p) => p.markdown ?? "")
      .join("\n")
      .trim();
    if (!texte) return null;
    return { texte };
  } catch {
    return null;
  }
}

/**
 * OCR Tesseract.js — local, gratuit, aucune donnée ne quitte la machine
 * (RGPD). Moins précis qu'une API cloud sur documents denses ; suffisant en
 * secours pour un avis de contravention. Langue : français (fra).
 */
async function tesseractOcr(buffer: Buffer): Promise<OcrResult | null> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("fra");
    try {
      const { data } = await worker.recognize(buffer);
      const texte = data.text?.trim();
      if (!texte) return null;
      return { texte, confiance: data.confidence };
    } finally {
      await worker.terminate();
    }
  } catch {
    return null;
  }
}

/** Provider de dev/E2E : retourne un texte de PV fictif déterministe. */
async function mockOcr(): Promise<OcrResult | null> {
  return {
    texte: `CONTRAVENTION
N° 123456789
Vous êtes avisé d'une infraction commise le 01/07/2026 à 14h32.
Véhicule : AB-123-CD
Montant : 135 €
Règlement par télépaiement : 123456789 02
N° de télé-paiement 123456789, clé 02`,
  };
}

const DATE_RE = /(\d{2}[\/-]\d{2}[\/-]\d{2,4})/;
const HEURE_RE = /(\d{1,2})[hH:.](\d{2})/;
const MONTANT_RE = /(\d{1,3}(?:[\s.]\d{3})*(?:[,.]\d{2})?)\s*(?:€|euros?)/i;
const NUM_RE = /(\d{3,4}[\s-]?\d{3,4}[\s-]?\d{3,4})/;

/** Plaque SIV moderne : AB-123-CD (séparateurs espace ou tiret). */
const PLAQUE_SIV_RE = /\b[A-Z]{2,3}[\s-]\d{2,4}[\s-][A-Z]{2}\b/;
/** Plaque FNI (ancien format) : 1234 AB 75. */
const PLAQUE_FNI_RE = /\b\d{2,4}[\s-][A-Z]{1,2}[\s-]\d{2,3}\b/;
/** Adresse : cherche une ligne contenant rue/avenue/bd + code postal. */
const ADRESSE_RE = /(?:\b\d{1,4}\s+(?:rue|avenue|av\.|boulevard|bd|chemin|impasse)[^\n]{0,60}\n?[^\n]{0,40}\b\d{5}\s+[A-ZÉÈÀÂÊÎÔÛÇ][^\n]{0,30})/i;
/** Lieu d'infraction : après "lieu" ou "à" + adresse. */
const LIEU_RE = /lieu[^\n]{0,5}[:\-]\s*([^\n]{5,80})/i;

function extrairePlaque(texte: string): string | undefined {
  // On cherche d'abord près des mots-clés pour éviter les faux positifs
  // (heures, dates, numéros).
  const ctx = texte.match(
    /(?:v[eé]hicule|plaque|immatriculation|v[eé]rificateur)[^\n]{0,60}/i,
  );
  const source = ctx ? ctx[0] : texte;

  const fni = source.match(PLAQUE_FNI_RE);
  if (fni) return fni[0].replace(/\s+/g, "-").toUpperCase();

  const siv = source.match(PLAQUE_SIV_RE);
  if (siv) return siv[0].replace(/\s+/g, "-").toUpperCase();

  return undefined;
}

/**
 * Normalise le texte brut de l'OCR en données structurées pour le formulaire
 * d'analyse. Fonction pure, testée unitairement. N'extrait que ce qui est
 * fiable ; le reste reste à la charge de la relecture humaine.
 */
export function normaliserPv(texte: string): Partial<ExtractedData> {
  const result: Partial<ExtractedData> = {};

  const montantMatch = texte.match(MONTANT_RE);
  if (montantMatch) {
    const val = Number(montantMatch[1].replace(/[\s.]/g, "").replace(",", "."));
    if (!Number.isNaN(val)) {
      result.montant = `${val.toFixed(2).replace(".", ",")} €`;
    }
  }

  const numMatch = texte.match(NUM_RE);
  if (numMatch) result.num_pv = numMatch[1].replace(/[\s-]/g, "");

  const plaque = extrairePlaque(texte);
  if (plaque) result.plaque = plaque;

  const dateMatch = texte.match(DATE_RE);
  if (dateMatch) {
    const [d, m, y] = dateMatch[1].split(/[/-]/);
    result.date = `${y.length === 4 ? y : `20${y}`}-${m}-${d}`;
  }

  const heureMatch = texte.match(HEURE_RE);
  if (heureMatch) {
    result.heure = `${heureMatch[1].padStart(2, "0")}h${heureMatch[2]}`;
  }

  const adresseMatch = texte.match(ADRESSE_RE);
  if (adresseMatch) result.adresse = adresseMatch[0].replace(/\s+/g, " ").trim().slice(0, 120);

  const lieuMatch = texte.match(LIEU_RE);
  if (lieuMatch) result.lieu = lieuMatch[1].trim().slice(0, 120);

  // SUSPENSION : motif / préfecture / durée
  if (/suspension|pr[eé]fet/i.test(texte)) {
    const motifM = texte.match(/(?:alcool|stup[eé]fiant|vitesse|excès|points)/i);
    if (motifM) result.motif = motifM[0].toLowerCase();
    const dureeM = texte.match(/(\d+\s*(?:mois|jours|ans))/i);
    if (dureeM) result.duree = dureeM[1];
    const prefM = texte.match(/pr[eé]fecture[^\n]{0,40}/i);
    if (prefM) result.prefecture = prefM[0].trim().slice(0, 80);
  }

  return result;
}
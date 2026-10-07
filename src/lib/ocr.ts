import type { ExtractedData } from "@/lib/moteur";

export type OcrResult = {
  texte: string;
  confiance?: number;
  /** Champs structurés éventuels (Gemini les extrait nativement) — sinon,
   * normaliserPv(texte) s'applique en secours. */
  extrait?: Partial<ExtractedData>;
};

export type OcrProvider = "google-vision" | "mistral-ocr" | "gemini-flash" | "tesseract" | "mock" | "aucun";

export function getOcrProvider(): OcrProvider {
  const raw = (process.env.OCR_PROVIDER ?? "").toLowerCase();
  if (raw === "google-vision") {
    return process.env.GOOGLE_VISION_KEY ? "google-vision" : "aucun";
  }
  if (raw === "mistral-ocr") {
    // Mistral AI (hébergement UE) — alternative RGPD à Google Vision.
    return process.env.MISTRAL_API_KEY ? "mistral-ocr" : "aucun";
  }
  if (raw === "gemini-flash") {
    // Google Gemini Flash — niveau gratuit généreux (AI Studio), OCR d'image
    // (jpeg/png/webp) très rapide. Nécessite une clé API Google AI.
    return process.env.GEMINI_API_KEY ? "gemini-flash" : "aucun";
  }
  if (raw === "tesseract") return "tesseract";
  if (raw === "mock") return "mock";
  return "aucun";
}

/**
 * OCR de l'avis de contravention. Le résultat n'est JAMAIS envoyé tel quel :
 * il pré-remplit le formulaire d'analyse soumis par un humain (garde-fou
 * human-in-the-loop). Sans provider configuré, renvoie null.
 *
 * PDF : la couche texte est lue **en local** (pdf-parse) pour TOUS les
 * providers — un PDF à texte ne dépend d'aucune API (les API d'OCR images
 * n'acceptent jamais un PDF dans `image.content`, et Gemini saturait en
 * prod sur des PDF pourtant lisibles en local). Sans couche texte (scan),
 * on en extrait les images intégrées pour l'OCR image, sauf Gemini qui lit
 * le PDF entier via sa Files API.
 *
 * Garde-fous temporalité : un OCR qui pend ne doit JAMAIS faire échouer le
 * dépôt du dossier — watchdog global (`OCR_TIMEOUT_MS`) + délai par requête
 * HTTP (`OCR_HTTP_TIMEOUT_MS`), voir `createDossier` (dossier créé avant OCR).
 */
const OCR_TIMEOUT_MS_DEFAUT = 20_000;
const OCR_HTTP_TIMEOUT_MS_DEFAUT = 10_000;

function delaiOcr(env: string | undefined, defaut: number): number {
  return env && /^\d+$/.test(env) ? Number(env) : defaut;
}

/** Délai global d'un cycle OCR (API, pdf-parse, tesseract) : passé, on rend
 * null et le client saisit à la main — jamais d'exception, jamais de hang. */
export async function extrairePv(buffer: Buffer): Promise<OcrResult | null> {
  const provider = getOcrProvider();
  if (provider === "mock") return mockOcr();
  if (provider === "aucun") return null;

  const delai = delaiOcr(process.env.OCR_TIMEOUT_MS, OCR_TIMEOUT_MS_DEFAUT);
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      extrairePvSelonFormat(buffer, provider),
      new Promise<null>((resolve) => {
        minuteur = setTimeout(() => {
          console.error(
            JSON.stringify({ evt: "ocr:timeout", provider, ms: delai }),
          );
          resolve(null);
        }, delai);
      }),
    ]);
  } finally {
    clearTimeout(minuteur);
  }
}

async function extrairePvSelonFormat(
  buffer: Buffer,
  provider: OcrProvider,
): Promise<OcrResult | null> {
  if (detecterMime(buffer) === "application/pdf") {
    return lirePdfAvecProvider(buffer, provider);
  }

  if (provider === "gemini-flash") return geminiFlashOcr(buffer);
  if (provider === "google-vision") return googleVisionOcr(buffer);
  if (provider === "mistral-ocr") return mistralOcr(buffer);
  if (provider === "tesseract") return tesseractOcr(buffer);
  return null;
}

/**
 * `fetch` borné (`AbortSignal.timeout`) : une API qui ne répond pas est
 * coupée après `OCR_HTTP_TIMEOUT_MS` au lieu de faire attendre la server
 * action jusqu'au kill plateforme. L'expiration est convertie en
 * `ErreurHttp(504)` — transitoire, donc gérée par le retry existant.
 */
function fetchOcr(url: string, init: RequestInit = {}): Promise<Response> {
  const delai = delaiOcr(
    process.env.OCR_HTTP_TIMEOUT_MS,
    OCR_HTTP_TIMEOUT_MS_DEFAUT,
  );
  return (async () => {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(delai),
      });
    } catch (err) {
      const nom = err instanceof Error ? err.name : "";
      if (nom === "TimeoutError" || nom === "AbortError") {
        throw new ErreurHttp(504, `délai OCR dépassé (${delai} ms)`);
      }
      throw err;
    }
  })();
}

/** Seuil sous lequel on considère qu'un PDF n'a pas de couche texte exploitable. */
const SEUIL_TEXTE_PDF = 10; // mots
/** Images intégrées maximales OCRisées dans un PDF scanné (1 par page en pratique). */
const MAX_IMAGES_PDF = 4;

type PdfParse = InstanceType<typeof import("pdf-parse").PDFParse>;

/**
 * Lit un PDF pour le provider configuré : d'abord la couche texte (local,
 * gratuit, immédiat — tous les providers, Gemini compris), sinon le scan.
 *
 * Sans couche texte exploitable : Gemini reçoit le PDF entier (sa Files API
 * lit les documents nativement), les autres providers passent par les images
 * intégrées extraites en local.
 *
 * Jamais d'exception propagée : un PDF illisible laisse le client saisir à la
 * main et est journalisé.
 */
async function lirePdfAvecProvider(
  buffer: Buffer,
  provider: OcrProvider,
): Promise<OcrResult | null> {
  const debut = Date.now();
  let parser: PdfParse | undefined;
  try {
    const { PDFParse } = await import("pdf-parse");
    parser = new PDFParse({ data: new Uint8Array(buffer) });

    const lu = await parser.getText();
    const texte = (lu?.text ?? "").replace(/\r\n/g, "\n").trim();
    const mots = texte ? texte.split(/\s+/).length : 0;
    if (mots >= SEUIL_TEXTE_PDF) {
      console.log(
        JSON.stringify({ evt: "ocr:pdf", couche: "texte", provider, mots, pages: lu?.total ?? 0, ms: Date.now() - debut }),
      );
      return { texte };
    }

    if (provider === "gemini-flash") {
      // PDF scanné : Gemini lit le document entier (Files API) — le seul
      // chemin qu'il connaît pour un PDF, préservé tel quel.
      const res = await geminiFlashOcr(buffer);
      console.log(
        JSON.stringify({ evt: "ocr:pdf", couche: "gemini", provider, mots, ok: Boolean(res), ms: Date.now() - debut }),
      );
      return res;
    }

    const images = await imagesDepuisPdf(parser);
    if (images.length === 0) {
      console.error(
        `[ocr:pdf] ni couche texte (${mots} mot(s)) ni image intégrée — PDF non exploitable par ${provider}`,
      );
      return null;
    }
    const textes: string[] = [];
    for (const img of images) {
      const r = await ocrImage(img, provider);
      if (r?.texte) textes.push(r.texte.trim());
    }
    const concatene = textes.join("\n\n").trim();
    console.log(
      JSON.stringify({ evt: "ocr:pdf", couche: "images", provider, images: images.length, chars: concatene.length, ms: Date.now() - debut }),
    );
    return concatene ? { texte: concatene } : null;
  } catch (err) {
    console.error("[ocr:pdf] échec :", err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    // Repli : la lecture locale a échoué (polyfill canvas absent de la
    // plateforme, PDF corrompu…) — on ne bloque pas pour autant. Gemini
    // reçoit le PDF entier (Files API, comportement d'avant P1) ; les autres
    // providers n'ont aucun flux images sans parser, reste la saisie manuelle.
    if (provider === "gemini-flash") {
      const res = await geminiFlashOcr(buffer);
      console.log(
        JSON.stringify({ evt: "ocr:pdf", couche: "gemini-repli", ok: Boolean(res), ms: Date.now() - debut }),
      );
      return res;
    }
    return null;
  } finally {
    if (parser) await parser.destroy().catch(() => undefined);
  }
}

/** Extrait les images JPEG/PNG/WebP intégrées (page par page, plafonné). */
async function imagesDepuisPdf(parser: PdfParse): Promise<Buffer[]> {
  const out: Buffer[] = [];
  try {
    const res = await parser.getImage();
    for (const page of res?.pages ?? []) {
      for (const img of page?.images ?? []) {
        const raw = img?.dataUrl ?? "";
        const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(raw);
        if (!m) continue;
        const octets = Buffer.from(m[2], "base64");
        if (octets.length < 2_000) continue; // vignettes / icônes
        out.push(octets);
        if (out.length >= MAX_IMAGES_PDF) return out;
      }
    }
  } catch (err) {
    console.error("[ocr:pdf] lecture images impossible :", err instanceof Error ? err.message : String(err));
  }
  return out;
}

/** Route une image vers le provider d'images configuré. */
async function ocrImage(buffer: Buffer, provider: OcrProvider): Promise<OcrResult | null> {
  if (provider === "google-vision") return googleVisionOcr(buffer);
  if (provider === "mistral-ocr") return mistralOcr(buffer);
  if (provider === "tesseract") return tesseractOcr(buffer);
  return null;
}

/**
 * Erreur HTTP portant son statut, pour distinguer un échec transitoire
 * (503 « high demand » de Gemini, 429 quota, 502/504 réseau) d'une erreur
 * permanente (400 requête invalide, 401/403 clé).
 */
class ErreurHttp extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`HTTP ${status}`);
    this.name = "ErreurHttp";
  }
}

/** Statuts qu'on retente : surcharge amont, quota, réseau. */
const STATUTS_TRANSITOIRES = new Set([408, 425, 429, 500, 502, 503, 504]);

export function estTransitoire(status: number): boolean {
  return STATUTS_TRANSITOIRES.has(status);
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Réessaie un appel sur échec transitoire, avec backoff exponentiel.
 * Google renvoie couramment « 503 … high demand, temporary » sur le modèle
 * Flash : sans nouvelle tentative, un upload client se retrouve sans OCR
 * pré-rempli alors que le service était juste saturé à l'instant T.
 */
async function avecRetry<T>(
  op: (essai: number) => Promise<T>,
  tentatives = 3,
): Promise<T> {
  let dernier: unknown;
  for (let essai = 1; essai <= tentatives; essai++) {
    try {
      return await op(essai);
    } catch (err) {
      dernier = err;
      if (!(err instanceof ErreurHttp) || !estTransitoire(err.status)) break;
      if (essai === tentatives) break;
      const pause = 400 * 2 ** (essai - 1); // 400 ms puis 800 ms
      console.error(
        `[ocr] échec transitoire HTTP ${err.status} — nouvelle tentative ${essai + 1}/${tentatives} dans ${pause} ms`,
      );
      await attendre(pause);
    }
  }
  throw dernier;
}

/** Détection du MIME par magie-bytes (Gemini exige le bon type inline_data). */
function detecterMime(buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return "application/octet-stream";
}

/**
 * OCR Google Gemini Flash (generativelanguage.googleapis.com) — niveau
 * gratuit généreux via AI Studio, OCR ultra-rapide, aucune donnée stockée
 * par l'app. Modèle par défaut gemini-3.6-flash (surchargé par GEMINI_MODEL).
 * Images (jpeg/png/webp) : envoyées en inline_data. PDF : téléversé via la
 * Gemini Files API (limite 20 Mo) puis lu via file_data avant suppression.
 * Demande à Gemini un JSON : le texte brut (conservé tel quel) PLUS les
 * champs structurés (numéro PV, plaque, dates…), pré-remplissage bien plus
 * fiable que les regex de normaliserPv — la saisie humaine reste obligatoire.
 */
/**
 * Point d'entrée Gemini : réessaie les échecs transitoires (503 « high
 * demand », 429 quota, 502/504) puis abandonne en renvoyant null — jamais
 * d'exception : un OCR en échec laisse le client saisir à la main.
 */
async function geminiFlashOcr(buffer: Buffer): Promise<OcrResult | null> {
  try {
    return await avecRetry(() => geminiFlashOcrUnEssai(buffer));
  } catch (err) {
    console.error(
      "[ocr:gemini] échec final :",
      err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    );
    return null;
  }
}

async function geminiFlashOcrUnEssai(buffer: Buffer): Promise<OcrResult | null> {
  try {
    const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
    const mime = detecterMime(buffer);
    if (mime === "application/octet-stream") return null;

    let parts: unknown[];
    if (mime === "application/pdf") {
      const fileUri = await geminiUploadFile(buffer, mime);
      if (!fileUri) {
        console.error("[ocr:gemini] échec téléversement PDF (Files API)");
        return null;
      }
      parts = [
        { file_data: { file_uri: fileUri, mime_type: mime } },
        { text: PROMPT_EXTRACTION_JSON },
      ];
    } else {
      parts = [
        { inline_data: { mime_type: mime, data: buffer.toString("base64") } },
        { text: PROMPT_EXTRACTION_JSON },
      ];
    }

    const res = await fetchOcr(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
        },
        cache: "no-store",
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { response_mime_type: "application/json" },
        }),
      },
    );
    if (!res.ok) {
      const detail = await res.text();
      console.error("[ocr:gemini] generateContent HTTP", res.status, detail);
      if (estTransitoire(res.status)) throw new ErreurHttp(res.status, detail);
      return null;
    }

    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const brut = (body.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!brut) {
      console.error("[ocr:gemini] réponse sans texte", JSON.stringify(body).slice(0, 300));
      return null;
    }

    const parse = parseJsonBorne(brut);
    if (!parse) {
      console.error("[ocr:gemini] JSON illisible", brut.slice(0, 300));
      return null;
    }
    const texte = typeof parse.texte === "string" && parse.texte.trim() ? parse.texte.trim() : brut;
    const extrait: Partial<ExtractedData> = {};
    for (const champ of [
      "nom",
      "plaque",
      "num_pv",
      "date",
      "heure",
      "montant",
      "typeRadar",
      "radarId",
      "adresse",
      "lieu",
      "prefecture",
      "duree",
      "motif",
    ] as const) {
      const v = parse[champ];
      if (typeof v === "string" && v.trim()) extrait[champ] = v.trim().slice(0, 140);
    }
    if (parse["numTelePaiement"]) {
      const t = String(parse["numTelePaiement"]).trim().slice(0, 20);
      if (t) extrait.numTelePaiement = t;
    }
    if (typeof parse["cle"] === "string" && parse["cle"].trim()) {
      extrait.cle = parse["cle"].trim().slice(0, 4);
    }
    return { texte, extrait: Object.keys(extrait).length ? extrait : undefined };
  } catch (err) {
    // Les échecs transitoires doivent remonter à avecRetry : c'est exactement
    // le cas à réessayer (503 « high demand »). Les autres renvoient null.
    if (err instanceof ErreurHttp) throw err;
    console.error("[ocr:gemini] échec :", err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    return null;
  }
}

/** Extraction d'objets JSON, tolérante au format (blocs ```json, fioritures). */
function parseJsonBorne(brut: string): Record<string, unknown> | null {
  try {
    return JSON.parse(brut);
  } catch {
    const bloc = brut.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (bloc) {
      try {
        return JSON.parse(bloc.trim());
      } catch {
        return null;
      }
    }
    return null;
  }
}

const PROMPT_EXTRACTION_JSON = `Lis cet avis de contravention (ou cette décision de suspension) et réponds UNIQUEMENT par un objet JSON valide, sans commentaire, avec EXACTEMENT ces clés (chaque valeur : la donnée telle qu'imprimée, ou "" si absente) :
- "texte" : le texte brute intégral du document, lettre par lettre, sans reformuler ni résumer
- "nom" : nom du titulaire (ex : MARTIN Jean)
- "plaque" : immatriculation exacte (ex : AA-123-BB)
- "num_pv" : numéro de l'avis complet (ex : 37592048152634)
- "date" : date de l'avis/infraction au format AAAA-MM-JJ
- "heure" : heure au format HHhMM
- "montant" : montant de l'amende en euros avec 2 décimales (ex : "135,00 €")
- "typeRadar" : modèle de l'appareil (ex : RADAR MESTA 210C)
- "radarId" : numéro d'identification du radar (ex : 1248)
- "lieu" : lieu de l'infraction (ex : Avenue de la République - METZ)
- "adresse" : adresse du titulaire (rue + code postal + ville)
- "prefecture" : préfecture émettrice de la décision si mentionnée (ex : Préfecture de la Gironde)
- "duree" : durée de suspension ou de rétention si mentionnée (ex : 6 mois)
- "motif" : motif de la suspension si mentionné (ex : alcoolémie)
- "numTelePaiement" : numéro de télépaiement complet s'il figure
- "cle" : clé de télépaiement (1 chiffre) si elle figure`;

/**
 * Téléverse un fichier (PDF) sur la Gemini Files API et renvoie son URI.
 * Réf. : https://ai.google.dev/api/files. Deux requêtes : start (resumable)
 * puis upload+finalize.
 */
async function geminiUploadFile(buffer: Buffer, mime: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY ?? "";
  // Étape 1 — start : ouvre une session de téléversement, récupère l'URL dédiée.
  const start = await fetchOcr(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${key}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-File-Size": String(buffer.byteLength),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file: { display_name: `pv-${Date.now()}.pdf`, mime_type: mime },
    }),
  });
  if (!start.ok) {
    const detail = await start.text();
    console.error("[ocr:gemini] upload start HTTP", start.status, detail);
    if (estTransitoire(start.status)) throw new ErreurHttp(start.status, detail);
    return null;
  }
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    console.error("[ocr:gemini] upload start sans x-goog-upload-url");
    return null;
  }

  // Étape 2 — upload + finalize : pousse les octets du fichier.
  const upload = await fetchOcr(uploadUrl, {
    method: "PUT",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Length": String(buffer.byteLength),
    },
    body: Buffer.from(buffer),
  });
  if (!upload.ok) {
    const detail = await upload.text();
    console.error("[ocr:gemini] upload push HTTP", upload.status, detail);
    if (estTransitoire(upload.status)) throw new ErreurHttp(upload.status, detail);
    return null;
  }
  const meta = (await upload.json()) as { file?: { uri?: string } };
  if (!meta.file?.uri) {
    console.error("[ocr:gemini] upload push sans file.uri", JSON.stringify(meta).slice(0, 300));
    return null;
  }
  return meta.file.uri;
}

/**
 * OCR Google Cloud Vision (`images:annotate`).
 *
 * ⚠ N'accepte des images **que** en `image.content` (base64) : un PDF doit
 * passer par `files:asyncBatchAnnotate` + Cloud Storage — c'est pourquoi les
 * PDF sont détournés vers `lirePdfAvecProvider` avant tout appel ici.
 *
 * Deux pièges traités :
 *  - Google renvoie souvent HTTP 200 avec une erreur **dans** le corps
 *    (`responses[0].error`) : `res.ok` est vrai, il faut lire le corps ;
 *  - l'ancienne version renvoyait `null` sans rien journaliser, rendant
 *    tout échec totalement invisible en production. Chaque refus est loggé.
 */
async function googleVisionOcr(buffer: Buffer): Promise<OcrResult | null> {
  try {
    return await avecRetry(() => googleVisionOcrUnEssai(buffer));
  } catch (err) {
    console.error(
      "[ocr:vision] échec final :",
      err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    );
    return null;
  }
}

async function googleVisionOcrUnEssai(buffer: Buffer): Promise<OcrResult | null> {
  const mime = detecterMime(buffer);
  if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") {
    // Garde-fou : jamais de requête invalide envoyée (et jamais de PDF ici).
    console.error(`[ocr:vision] format refusé (mime=${mime}) — requête non envoyée`);
    return null;
  }

  const res = await fetchOcr(`https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      requests: [
        {
          image: { content: buffer.toString("base64") },
          // DOCUMENT_TEXT_DETECTION : optimisé pour les documents denses
          // (un avis de contravention) ; TEXT_DETECTION renvoie moins bien.
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[ocr:vision] HTTP ${res.status}`, detail.slice(0, 300));
    if (estTransitoire(res.status)) throw new ErreurHttp(res.status, detail);
    return null;
  }

  const body = (await res.json().catch(() => null)) as {
    responses?: { error?: { code?: number; message?: string }; fullTextAnnotation?: { text?: string }; textAnnotations?: { description?: string }[] }[];
  } | null;
  const rep = body?.responses?.[0];
  if (rep?.error) {
    const code = rep.error.code ?? 0;
    const message = rep.error.message ?? "";
    console.error(`[ocr:vision] erreur API ${code}`, message.slice(0, 300));
    // Codes gRPC : 8 RESOURCE_EXHAUSTED (quota), 14 UNAVAILABLE (saturation).
    const statut = code === 8 ? 429 : code === 14 ? 503 : 0;
    if (statut) throw new ErreurHttp(statut, message);
    return null;
  }

  const texte = (rep?.fullTextAnnotation?.text ?? rep?.textAnnotations?.[0]?.description ?? "").trim();
  if (!texte) {
    console.error("[ocr:vision] réponse sans texte", JSON.stringify(body).slice(0, 300));
    return null;
  }
  return { texte };
}

/**
 * OCR Mistral AI (api.mistral.ai) — alternative hébergée en UE (RGPD),
 * facturée par page. Envoie l'image en base64 (data URL) et concatène le
 * markdown des pages. Réf. : https://docs.mistral.ai/capabilities/document/.
 */
async function mistralOcr(buffer: Buffer): Promise<OcrResult | null> {
  const mime = detecterMime(buffer);
  if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") {
    console.error(`[ocr:mistral] format refusé (mime=${mime}) — requête non envoyée`);
    return null;
  }
  try {
    const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
    const res = await fetchOcr("https://api.mistral.ai/v1/ocr", {
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
    // Vercel : le cwd est en lecture seule, seule /tmp est écrivable. Le
    // traineddata (fra) est téléchargé au runtime depuis le CDN jsDelivr puis
    // caché dans cachePath — obligatoire en production serverless.
    const cachePath = process.env.NODE_ENV === "production" ? "/tmp" : undefined;
    const worker = await createWorker("fra", undefined, {
      ...(cachePath ? { cachePath } : {}),
    });
    try {
      const { data } = await worker.recognize(buffer);
      const texte = data.text?.trim();
      if (!texte) return null;
      return { texte, confiance: data.confidence };
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    // Journalisé pour diagnostic (Vercel) : sans ce log, l'échec OCR est
    // totalement invisible (le flux continue, champs simplement non pré-remplis).
    console.error("[ocr:tesseract] échec :", err);
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

/** Date slashes/barres, jamais à l'intérieur d'une date ISO
 * (« 2026-07-01 » ne doit pas être lu en « 26-07-01 »). */
const DATE_RE = /(?<!\d)(\d{2}[\/-]\d{2}[\/-]\d{2,4})/;
/** Date en toutes lettres : « 1er juillet 2026 », « 15 déc. 2026 ». */
const DATE_TEXTUELLE_RE = /\b(\d{1,2})(?:er|\.)?\s+([A-Za-zÀ-ÿ]{3,9})\.?\s+(\d{4})\b/;
/** Date ISO déjà formatée par certains OCR (Gemini le demande explicitement). */
const DATE_ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const HEURE_RE = /(\d{1,2})[hH:.](\d{2})/;
const MONTANT_RE = /(\d{1,3}(?:[\s.]\d{3})*(?:[,.]\d{2})?)\s*(?:€|euros?)/i;
const NUM_RE = /(\d{3,4}[\s-]?\d{3,4}[\s-]?\d{3,4})/;
/** Numéro près d'un libellé d'avis (« N° d'avis… », « Numéro de l'avis : » —
 * la forme officielle des avis) — évite de capter un montant, une date ou le
 * n° de télépaiement, et surtout de retomber sur le repli NUM_RE (12 chiffres
 * max) qui tronquait les vrais numéros d'avis (14 chiffres). */
const NUM_AVIS_RE = /\b(?:n[°º]\s*d['’]?\s*avis|num[ée]ro\s+de\s+l['’]\s*avis|n[°º]\s+de\s+l['’]\s*avis|avis(?:\s+de\s+contravention)?\s+n[°º]|proc(?:è|e)s-verbal\s+n[°º])\s*[^\d]{0,30}(\d[\d\s.-]{7,18}\d)/i;
/** Télépaiement : numéro de paiement en ligne (2 formats : groupé ou avec
 * espaces, le nom n° 1234567890123). */
const TELEPAIEMENT_RE = /t[ée]l[ée]?[-\s]?paiement\s*(?:n[°º])?\s*[^\d]{0,15}(\d[\d\s-]{7,18}\d)/i;
/** Clé de télépaiement (1 à 2 chiffres) — jamais extraite ailleurs. */
const CLE_TELEPAIEMENT_RE = /\bcl[ée]\s*[:\-]?\s*(\d{1,2})\b/i;

/** Plaque SIV moderne : AB-123-CD (séparateurs espace ou tiret). */
const PLAQUE_SIV_RE = /\b[A-Z]{2,3}[\s-]\d{2,4}[\s-][A-Z]{2}\b/;
/** Plaque FNI (ancien format) : 1234 AB 75. */
const PLAQUE_FNI_RE = /\b\d{2,4}[\s-][A-Z]{1,2}[\s-]\d{2,3}\b/;
/** Passage permissif : 3 segments libres (lettres ou chiffres) — sert à
 * réparer les confusions d'OCR (0↔O, 1↔I) en contexte véhicule. */
const PLAQUE_PERMISE_RE = /\b([A-Z0-9]{2,4})[\s-]([A-Z0-9]{2,4})[\s-]([A-Z0-9]{2,3})\b/;
/** Adresse : tolérant — numéro + rue/bd/av/... + code postal + ville. Le code
 * postal peut être sur la ligne suivante (« 15 Rue des Lilas, Apt 4B↵75011
 * PARIS ») : sans ce `\s+`, seul le repli (peu propre) captait l'adresse. */
const ADRESSE_RE = /\b\d{1,4}\s+(?:rue|avenue|av\.?|boulevard|bd|chemin|impasse|all[eé]e|place|route|quai)[^\n]{0,60}\s+\d{5}\s+[A-Za-zÉÈÀÂÊÎÔÛÇéèàâêîôûç\- ]{2,40}/i;
const ADRESSE_FALLBACK_RE = /\b\d{5}\s+[A-ZÉÈÀÂÊÎÔÛÇ][A-ZÉÈÀÂÊÎÔÛÇa-zéèàâêîôûç\- ]{2,30}\b/;
/** Lieu d'infraction : après "lieu" ou "à" + adresse. */
const LIEU_RE = /lieu[^\n]{0,5}[:\-]\s*([^\n]{5,80})/i;
const LIEU_FALLBACK_RE = /(?:à|au|lieu)\s+([A-ZÉÈÀÂÊÎÔÛÇa-zéèàâêîôûç0-9][^\n]{5,60})/i;
/** Nom du titulaire : exclusivement près d'un libellé explicite (« Titulaire :
 * MARTIN Jean », « NOM/PRÉNOM : … », « Destinataire : … ») — jamais déduit
 * d'une ligne libre (anti-hallucination). Même ligne uniquement (jamais `\s`
 * qui inclut `\n` : sinon « MARTIN Jean↵Adresse : … » avalerait la rubrique). */
const NOM_RE = /\b(?:nom\s*\/\s*pr[eé]nom|nom\s+du\s+titulaire|titulaire|propri[eé]taire|destinataire|conducteur|pr[eé]nom|nom)\s*[:\-]\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’\- \t]{1,59})/iu;
/** Radar : « Appareil : RADAR TYPE MESTA 210C - N° 1248 » (avis de vitesse). */
const RADAR_RE = /\b(?:appareil(?:\s+de\s+mesure)?|cin[eé]mom[eè]tre|radar)\s*[:\-]\s*([^\n]{3,70})/i;
/** Date de vérification périodique du cinémomètre — libellé obligatoire
 * (« Appareil de contrôle homologué » : « Date de vérification : … »,
 * « Vérification périodique du … », « Dernière vérification le … »). Jamais
 * de date déduite sans libellé : c'est la preuve d'entretien annuel. */
const DATE_VERIF_RE =
  /\b(?:derni[eè]re\s+)?(?:date\s+de\s+v[ée]rification(?:\s+p[ée]riodique)?|v[ée]rification\s+p[ée]riodique)\s*(?:du|le)?\s*[:\-]?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-zÀ-ÿ]{3,9}\.?\s+\d{4})/i;

/** Segment lettre : chiffres d'OCR (0→O, 1→I) réparés ; null si autre chiffre. */
function segLettres(s: string): string | null {
  const v = s.replace(/0/g, "O").replace(/1/g, "I");
  return /\d/.test(v) ? null : v;
}

/** Segment chiffres : lettres d'OCR (O→0, I/l→1) réparées ; null si autre lettre. */
function segChiffres(s: string): string | null {
  const v = s.replace(/[Oo]/g, "0").replace(/[Il]/g, "1");
  return /[A-Z]/.test(v) ? null : v;
}

/** Essai permissif de plaque (SIV puis FNI) avec réparation des confusions
 * d'OCR, strictement validé : un segment invalide = pas de plaque. */
function plaquePermise(source: string): string | undefined {
  const m = source.match(PLAQUE_PERMISE_RE);
  if (!m) return undefined;
  const [, a, b, c] = m;
  // SIV : lettres - chiffres - lettres
  const l1 = segLettres(a);
  const ch = segChiffres(b);
  const l2 = segLettres(c);
  if (l1 && ch && l2) return `${l1}-${ch}-${l2}`;
  // FNI : chiffres - lettres - chiffres
  const c1 = segChiffres(a);
  const l = segLettres(b);
  const c2 = segChiffres(c);
  if (c1 && l && c2) return `${c1}-${l}-${c2}`;
  return undefined;
}

function extrairePlaque(texte: string): string | undefined {
  // Toutes les fenêtres-clé du document, dans l'ordre du texte : un PV réel
  // mentionne « véhicule » (section 1, souvent sans plaque) AVANT la vraie
  // ligne « Immatriculation : AA-123-BB » (section 3) — la première fenêtre
  // seule étouffait l'extraction (lacune détectée en prod le 2026-10-06).
  const fenetres = [...texte.matchAll(
    /(?:v[eé]hicule|plaque|immatriculation|v[eé]rificateur)[^\n]{0,60}/gi,
  )].map((m) => m[0]);

  for (const f of fenetres) {
    const fni = f.match(PLAQUE_FNI_RE);
    if (fni) return fni[0].replace(/\s+/g, "-").toUpperCase();
    const siv = f.match(PLAQUE_SIV_RE);
    if (siv) return siv[0].replace(/\s+/g, "-").toUpperCase();
  }

  // Repli strict sur l'ensemble du texte : une plaque présente sans libellé
  // (ou dont le libellé n'est pas dans la liste) reste détectable.
  const fniTexte = texte.match(PLAQUE_FNI_RE);
  if (fniTexte) return fniTexte[0].replace(/\s+/g, "-").toUpperCase();
  const sivTexte = texte.match(PLAQUE_SIV_RE);
  if (sivTexte) return sivTexte[0].replace(/\s+/g, "-").toUpperCase();

  // Secours uniquement en contexte véhicule : les confusions 0/O et 1/I de
  // l'OCR ne doivent pas faire échouer la lecture — mais jamais globalement
  // (« 12 h 30 », dates… ne doivent pas devenir des plaques).
  for (const f of fenetres) {
    const permissive = plaquePermise(f);
    if (permissive) return permissive;
  }
  return undefined;
}

const MOIS_FR: Record<string, string> = {
  janv: "01", fevr: "02", mars: "03", avr: "04", mai: "05", juin: "06",
  juil: "07", aout: "08", sept: "09", oct: "10", nov: "11", dec: "12",
};

/** « juillet » → « 07 » (accents normalisés) ; null si ce n'est pas un mois. */
function moisVersNumero(token: string): string | null {
  const t = token
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  for (const [prefixe, num] of Object.entries(MOIS_FR)) {
    if (t.startsWith(prefixe)) return num;
  }
  return null;
}

/** Date au format ISO, quel que soit le rendu de l'OCR (slashes, toutes
 * lettres, ISO) — validée (mois 01-12, jour 01-31) pour ne jamais produire
 * une date absurde. Absente si aucun format fiable. */
function extraireDate(texte: string): string | undefined {
  // ISO d'abord : DATE_RE sinon le décrocherait à l'intérieur (« 26-07-01 »).
  const iso = texte.match(DATE_ISO_RE);
  if (iso) {
    const jour = Number(iso[3]);
    const mois = Number(iso[2]);
    if (jour >= 1 && jour <= 31 && mois >= 1 && mois <= 12) {
      return `${iso[1]}-${iso[2]}-${iso[3]}`;
    }
  }

  const slash = texte.match(DATE_RE);
  if (slash) {
    const [d, m, y] = slash[1].split(/[/-]/);
    const jour = Number(d);
    const mois = Number(m);
    if (jour >= 1 && jour <= 31 && mois >= 1 && mois <= 12) {
      return `${y.length === 4 ? y : `20${y}`}-${m}-${d}`;
    }
  }

  const tex = texte.match(DATE_TEXTUELLE_RE);
  if (tex) {
    const mois = moisVersNumero(tex[2]);
    const jour = Number(tex[1]);
    if (mois && jour >= 1 && jour <= 31) {
      return `${tex[3]}-${mois}-${String(jour).padStart(2, "0")}`;
    }
  }
  return undefined;
}

/**
 * N° d'avis, préféré près d'un libellé (« N° d'avis… », « avis de
 * contravention n°… »), sinon n'importe quel « n° » dont le contexte n'est
 * pas un paiement, sinon repli historique (premier groupe de chiffres).
 * Jamais de chiffres inventés : si rien de fiable, indéfini.
 */
function extraireNumPv(texte: string): string | undefined {
  const avis = texte.match(NUM_AVIS_RE);
  if (avis) return avis[1].replace(/[\s.-]/g, "");

  for (const m of texte.matchAll(/n[°º][^\d\n]{0,30}(\d[\d\s.-]{7,18}\d)/gi)) {
    const debut = m.index ?? 0;
    const contexte = texte.slice(Math.max(0, debut - 45), debut);
    if (/paiement/i.test(contexte)) continue; // n° de télépaiement ≠ n° d'avis
    return m[1].replace(/[\s.-]/g, "");
  }

  const fallback = texte.match(NUM_RE);
  return fallback ? fallback[1].replace(/[\s-]/g, "") : undefined;
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

  const numPv = extraireNumPv(texte);
  if (numPv) result.num_pv = numPv;

  const plaque = extrairePlaque(texte);
  if (plaque) result.plaque = plaque;

  // Nom du titulaire (libellé explicite, même ligne) — le champ « Nom » du
  // formulaire est requis : sans cette règle, un PDF à couche texte (lecture
  // locale, sans extrait Gemini) laissait le pré-remplissage vide.
  const nomM = texte.match(NOM_RE);
  if (nomM) {
    const nom = nomM[1].replace(/[\s\-–—|:]+$/, "").replace(/\s+/g, " ").trim();
    if (nom.length >= 2 && nom.length <= 60) result.nom = nom;
  }

  // Radar : type de l'appareil + numéro d'identification, près de « Appareil : ».
  const radarM = texte.match(RADAR_RE);
  if (radarM) {
    const ligne = radarM[1];
    const type = ligne.replace(/\s*[-–—]\s*n[°º].*$/i, "").replace(/\s+/g, " ").trim();
    if (type) result.typeRadar = type.slice(0, 60);
    const idM = ligne.match(/\bn[°º]\s*(\d{2,8})\b/i);
    if (idM) result.radarId = idM[1];
  }

  // Vérification périodique du cinémomètre (preuve d'entretien annuel) :
  // uniquement près du libellé officiel, sinon la date d'infraction ou un
  // montant pourrait être captés à tort.
  const verifM = texte.match(DATE_VERIF_RE);
  if (verifM) {
    const iso = extraireDate(verifM[1]);
    if (iso) result.dateVerificationAppareil = iso;
  }

  const date = extraireDate(texte);
  if (date) result.date = date;

  // Télépaiement (amendes payables en ligne) : numéro complet + clé, jamais
  // déduits d'un simple montant (≥9 chiffres exigés).
  const teleM = texte.match(TELEPAIEMENT_RE);
  if (teleM) {
    const num = teleM[1].replace(/[\s-]/g, "");
    if (num.length >= 9 && num.length <= 20) result.numTelePaiement = num;
  }
  const cleM = texte.match(CLE_TELEPAIEMENT_RE);
  if (cleM) result.cle = cleM[1];

  const heureMatch = texte.match(HEURE_RE);
  if (heureMatch) {
    result.heure = `${heureMatch[1].padStart(2, "0")}h${heureMatch[2]}`;
  }

  // Adresse : essai strict (rue + code postal, 1 ou 2 lignes) puis repli code
  // postal — borné aux lignes de rue/CP pour ne pas avaler les rubriques
  // voisines (« 4. EMPLACEMENT CLIC », « Titulaire : … »).
  let adresse: string | undefined;
  const adresseMatch = texte.match(ADRESSE_RE);
  if (adresseMatch) adresse = adresseMatch[0];
  else {
    const fallback = texte.match(ADRESSE_FALLBACK_RE);
    if (fallback) {
      const idx = fallback.index ?? 0;
      const ligneCp = texte.lastIndexOf("\n", idx) + 1; // ligne du code postal
      const lignePrec =
        ligneCp >= 2 ? texte.lastIndexOf("\n", ligneCp - 2) + 1 : 0;
      const finLigneCp = texte.indexOf("\n", idx);
      const end =
        finLigneCp === -1
          ? Math.min(texte.length, idx + fallback[0].length + 20)
          : finLigneCp;
      adresse = texte.slice(Math.min(lignePrec, idx), end);
    }
  }
  if (adresse) {
    result.adresse = adresse
      .replace(/\s+/g, " ")
      .replace(/[\s\-–—|:]+$/, "")
      .trim()
      .slice(0, 140);
  }

  let lieu: string | undefined;
  const lieuMatch = texte.match(LIEU_RE);
  if (lieuMatch) lieu = lieuMatch[1];
  else {
    const fb = texte.match(LIEU_FALLBACK_RE);
    if (fb) lieu = fb[1];
  }
  if (lieu) result.lieu = lieu.trim().slice(0, 120);

  // SUSPENSION : motif / préfecture / durée.
  // Décision de suspension, notification de rétention, lettre 48/48s : on ne
  // retient que des libellés explicites, et jamais on n'écrase un champ déjà
  // renseigné (l'humain reste maître — human-in-the-loop).
  if (
    /suspension|r[eé]tention|pr[eé]fet|48\s*(?:h|heures)|examen/i.test(texte)
  ) {
    const motifM = texte.match(
      /(?:alcool[eé]mie|stup[eé]fiants?|vitesse|exc[eè]s de vitesse|points? invalid[ée]s?|refus de souffle|d[eé]lits? de conduite)/i,
    );
    if (motifM) result.motif = motifM[0].toLowerCase();

    // Durée : uniquement si libellée, sinon n'importe quel nombre du texte.
    const dureeM = texte.match(
      /dur[ée]e[^0-9]{0,20}(\d+\s*(?:mois|jours?|ans?))/i,
    ) ?? texte.match(
      /(\d+\s*(?:mois|jours?|ans?))\s+de\s+(?:suspension|r[eé]tention)/i,
    );
    if (dureeM) result.duree = dureeM[1].replace(/\s+/g, " ");

    // Préfecture : on isole le nom du service, pas la ligne entière.
    // 1) on capture la queue de ligne (le département commence souvent par un
    //    article minuscule — « de la Gironde » — qu'une regex exigeant une
    //    majuscule manquerait) ;
    // 2) on tronque aux premiers séparateurs de rubric : un tiret **entouré
    //    d'espaces** (« Préfecture du Rhône - Date 01/07 » → « Rhône »), mais
    //    pas le trait d'union interne d'un nom de département
    //    (« Bouches-du-Rhône » doit rester entier).
    const prefM = texte.match(/(?:sous-)?pr[eé]fecture[^\S\n]*([^\n]{1,60})/iu);
    if (prefM?.[1]) {
      const nom = prefM[1]
        .replace(/^(?:de|du|des|la|le|les)\s+/iu, "")
        .split(
          // séparateurs de rubric : tiret ENTOURÉ d'espaces, ponctuation,
          // ou mot-clé précédé d'un espace. Le mot-clé doit être précédé d'une
          // espace sinon « Bouches-du-Rhône » serait coupé sur son « du ».
          /\s+[-–—]\s+|[,;:|()]|\s+(?:du|de|des|dès|date|motif|adresse)\b|\s+n[°º]/iu,
        )[0]
        .replace(/\s+/g, " ")
        .trim();
      if (nom) result.prefecture = nom.slice(0, 80);
    }
  }

  return result;
}

/** Un champ structuré n'est « fiable » (et donc jamais remplacé par la regex)
 * que s'il respecte son format : sinon une valeur incohérente venant du
 * provider (ex : plaque = numéro de dossier « 545526 ») étouffe la regex. */
function formatChampFiable(cle: string, valeur: string): boolean {
  if (cle === "plaque") {
    return PLAQUE_SIV_RE.test(valeur) || PLAQUE_FNI_RE.test(valeur);
  }
  if (cle === "date") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
    if (!m) return false;
    const mois = Number(m[2]);
    const jour = Number(m[3]);
    return mois >= 1 && mois <= 12 && jour >= 1 && jour <= 31;
  }
  return true;
}

/**
 * Pré-remplissage du formulaire d'analyse : **champs structurés du provider
 * (Gemini) d'abord, puis complément par les regex locales** sur le texte.
 *
 * Avant cette fusion, `createDossier` appliquait `struct OU normaliserPv` —
 * jamais les deux : un PDF à couche texte (lecture locale, extrait absent)
 * laissait le champ « Nom » vide alors que « Titulaire : MARTIN Jean » était
 * dans le texte, et les scans sans Gemini (repli) perdaient
 * prefecture/duree/motif. Règle : la regex ne remplace une valeur structurée
 * que si celle-ci est absente/vide **ou au format invalide** (plaque/date).
 */
export function fusionnerPrefill(
  extrait: Partial<ExtractedData> | undefined,
  texte: string,
): Record<string, string> {
  const prefill: Record<string, string> = {};
  if (extrait) {
    for (const [cle, valeur] of Object.entries(extrait)) {
      if (typeof valeur === "string" && valeur.trim()) prefill[cle] = valeur;
    }
  }
  const regex = normaliserPv(texte);
  for (const [cle, valeur] of Object.entries(regex)) {
    if (typeof valeur !== "string" || !valeur.trim()) continue;
    const actuel = prefill[cle];
    if (!actuel) {
      prefill[cle] = valeur; // champ absent → comblé
    } else if (!formatChampFiable(cle, actuel) && formatChampFiable(cle, valeur)) {
      prefill[cle] = valeur; // format invalide remplacé par la valeur regex
    }
  }
  return prefill;
}

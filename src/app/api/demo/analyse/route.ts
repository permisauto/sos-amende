import { prisma } from "@/lib/prisma";
import {
  detecterFailles,
  remplirTemplate,
  scoreFaille,
  type ExtractedData,
  type RegleDetection,
} from "@/lib/moteur";
import { extrairePv, getOcrProvider, normaliserPv } from "@/lib/ocr";
import { consommerCreneau } from "@/lib/rate-limit";
import type { JurisprudenceRef } from "@/lib/catalogue-sources";

/**
 * Démo de scan (landing) : SIMULATION automatique. Sans upload ni saisie,
 * la démo « téléverse » un échantillon (avis de contravention ou décision de
 * suspension), le scanne (OCR mock en dev), détecte les failles candidates,
 * calcule un score global et **génère la lettre de recours** depuis le
 * template de la faille principale.
 *
 * GARDE-FOU : c'est une SIMULATION de démonstration. Aucune donnée n'est
 * stockée, aucun dossier n'est créé, le résultat n'est jamais présenté comme
 * un avis juridique — la validation reste humaine (juriste). Les articles et
 * templates affichés proviennent toujours de la base (FailleJuridique
 * ACTIVE/PROPOSEE) — jamais inventés.
 */

/** Échantillons simulés utilisés par la démo (aucun upload requis). */
const ECHANTILLONS: Record<"AMENDE" | "SUSPENSION", string> = {
  AMENDE: `CONTRAVENTION
N° 123456789
Vous êtes avisé d'une infraction commise le 01/07/2020 à 14h32.
Véhicule : AB-123-CD
Montant : 135 €
Amende majorée : vous n'avez pas payé l'amende initiale dans les délais.`,
  SUSPENSION: `DÉCISION DE SUSPENSION
N° DEC-2026-0421
Votre permis de conduire est suspendu pour une durée de 6 mois.
Conduite sous l'empire d'un état alcoolique établie au moyen d'un éthylomètre.
Véhicule : AB-123-CD
Infraction commise le 01/07/2026.`,
};

// En mode simulation, la démo présente des scores de réussite favorables
// (chances estimées de succès), sans jamais être un avis juridique. Plancher
// de confiance pour que la démo montre toujours un résultat encourageant.
const SCORE_MIN_DEMO = 82;

type ResultatDemo = {
  id: string;
  titreFaille: string | null;
  articleLoi: string | null;
  source: string | null;
  jurisprudence: JurisprudenceRef[];
  score: number;
  reglesMatchées: number;
  reglesTotal: number;
  statut: string | null;
  proposition: boolean;
  motifsTexte: string[];
};

type FailleDb = {
  id: string;
  titreFaille: string;
  articleLoi: string | null;
  source: string | null;
  statut: string;
  templateLettre: string;
  jurisprudence: unknown;
  reglesDetection: unknown;
};

function construireResultat(
  faille: FailleDb | null,
  score: { matchees: number; total: number; score: number } | null,
  texte: string,
  demo: boolean,
): ResultatDemo {
  const motifsTexte: string[] = [];
  const texteBrut = texte ?? "";
  for (const regle of (faille?.reglesDetection as RegleDetection[] | null) ??
    []) {
    if (
      regle.type === "texteContient" &&
      texteBrut.toLowerCase().includes(regle.motif.toLowerCase())
    ) {
      motifsTexte.push(regle.motif);
    }
  }
  const scoreBrut = score?.score ?? 0;
  return {
    id: faille?.id ?? "",
    titreFaille: faille?.titreFaille ?? null,
    articleLoi: faille?.articleLoi ?? null,
    source: faille?.source ?? null,
    jurisprudence: (faille?.jurisprudence as JurisprudenceRef[] | null) ?? [],
    score: demo ? Math.max(scoreBrut, SCORE_MIN_DEMO) : scoreBrut,
    reglesMatchées: score?.matchees ?? 0,
    reglesTotal: score?.total ?? 0,
    statut: faille?.statut ?? null,
    proposition: faille?.statut === "PROPOSEE",
    motifsTexte,
  };
}

export async function POST(req: Request) {
  let type: "AMENDE" | "SUSPENSION" = "AMENDE";
  let texte: string | null = null;
  let data: ExtractedData = {};
  let simule = true;

  try {
    // Garde-fou anti-abus : la démo publique est une simulation — on borne le
    // nombre d'appels par IP et la taille des fichiers acceptés.
    const ip = (req.headers.get("x-forwarded-for") ?? "inconnue")
      .split(",")[0]
      .trim()
      .slice(0, 64);
    if (consommerCreneau(`demo:${ip}`, 20, 60 * 1000) === 0) {
      return new Response(
        JSON.stringify({
          erreur:
            "Trop de demandes de démonstration. Réessayez dans une minute.",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }

    const form = await req.formData();
    const typeRaw = String(form.get("type") ?? "AMENDE");
    if (typeRaw === "SUSPENSION") type = "SUSPENSION";

    const fichier = form.get("pv");
    if (fichier instanceof File && fichier.size > 0) {
      if (fichier.size > 8 * 1024 * 1024) {
        return new Response(
          JSON.stringify({
            erreur: "Fichier trop volumineux (maximum 8 Mo).",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      // Garde-fou RGPD/coût : la démo publique n'exécute JAMAIS d'OCR payant
      // (Google Vision / Mistral hébergé). Seuls les providers locaux et
      // gratuits (mock, tesseract) peuvent scanner un fichier ici — sinon on
      // retombe sur l'échantillon simulé.
      const provider = getOcrProvider();
      const buffer = Buffer.from(await fichier.arrayBuffer());
      const ocr =
        provider === "google-vision" || provider === "mistral-ocr"
          ? null
          : await extrairePv(buffer);
      if (ocr?.texte) {
        texte = ocr.texte;
        data = { ...data, ...normaliserPv(ocr.texte) };
        simule = false;
      }
    }

    const texteLibre = String(form.get("texte") ?? "").trim();
    if (!texte && texteLibre) {
      texte = texteLibre;
      data = { ...data, ...normaliserPv(texteLibre) };
      simule = false;
    }

    const date = String(form.get("date") ?? "").trim();
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) data.date = date;
    for (const k of ["adresse", "lieu", "prefecture", "duree", "motif", "plaque", "num_pv", "heure", "montant"] as const) {
      const v = String(form.get(k) ?? "").trim();
      if (v) (data as Record<string, unknown>)[k] = v;
    }
    // Questions complémentaires dynamiques (scan complet) — booléens
    for (const k of ["paiementDejaFait", "vehiculeCede", "vehiculeVole", "conducteurDifferent", "plaqueIncorrecte"] as const) {
      if (String(form.get(k) ?? "") === "on") (data as Record<string, unknown>)[k] = true;
    }
    if (String(form.get("travaux_présents") ?? "") === "true") (data as Record<string, unknown>).travaux_présents = true;
    if (String(form.get("conditions_meteo") ?? "").trim()) (data as Record<string, unknown>).conditions_meteo = String(form.get("conditions_meteo") ?? "").trim();
    if (String(form.get("adresseIncorrecte") ?? "") === "on") (data as Record<string, unknown>).adresseIncorrecte = true;

    // Sans document fourni : la démo simule le téléversement d'un échantillon.
    if (!texte) {
      texte = ECHANTILLONS[type];
      data = { ...data, ...normaliserPv(texte) };
      // Identité fictive pour la lettre démo (remplissage du template).
      data.nom = data.nom ?? "Alex Martin";
      simule = true;
    }

    // Démo : failles ACTIVE (validées) **et** PROPOSEE — jamais INACTIVE.
    // Résilient : si la DB est indisponible (TLS pooler), on dégrade en scoring vide mais l'OCR reste utile.
    let faillesDb: FailleDb[] = [];
    try {
      faillesDb = (await prisma.failleJuridique.findMany({
        where: { typeInfraction: type, statut: { in: ["ACTIVE", "PROPOSEE"] } },
        orderBy: { createdAt: "desc" },
      })) as unknown as FailleDb[];
    } catch (e) {
      console.error("demo analyse: prisma findMany fail, fallback vide", e);
      faillesDb = [];
    }

    // Preuve radar : si radarId présent, on vérifie l'étalonnage (faille + preuve)
    let dateExpirationEtalonnage: Date | null = null;
    const radarId = (data as Record<string, unknown>).radarId as string | undefined;
    if (radarId) {
      try {
        const cal = await prisma.radarCalibration.findFirst({ where: { radarId }, orderBy: { dateExpiration: "desc" } });
        if (cal) dateExpirationEtalonnage = cal.dateExpiration;
      } catch {}
    }

    const candidats = detecterFailles(
      data,
      texte,
      faillesDb.map((f) => ({
        id: f.id,
        reglesDetection: f.reglesDetection as unknown as | RegleDetection[] | null,
      })),
      { dateExpirationEtalonnage },
    );

    let resultats = candidats.map((id) => {
      const faille = faillesDb.find((f) => f.id === id) ?? null;
      const score = faille
        ? scoreFaille(
            { id: faille.id, reglesDetection: faille.reglesDetection as unknown as | RegleDetection[] | null },
            data,
            texte,
            { dateExpirationEtalonnage },
          )
        : null;
      return construireResultat(faille, score, texte ?? "", simule);
    });

    // Repli démo (aucun candidat) : on présente les failles de la base pour
    // que la démo montre toujours des failles détectées avec un score
    // favorable. Articles et templates réels — jamais inventés.
    if (simule && resultats.length === 0 && faillesDb.length > 0) {
      resultats = faillesDb.slice(0, 3).map((faille, i) =>
        construireResultat(
          faille,
          { matchees: 1, total: 1, score: SCORE_MIN_DEMO - i * 4 },
          texte ?? "",
          true,
        ),
      );
    }

    // Score global pointu : pondéré par questionnaire + preuves
    // Top1 70% + top2 30% si 2 failles, sinon max. Questionnaire affine déjà chaque score.
    let scoreGlobal = 0;
    if (resultats.length > 0) {
      const sorted = [...resultats].sort((a, b) => b.score - a.score);
      if (sorted.length === 1) scoreGlobal = sorted[0].score;
      else scoreGlobal = Math.round(sorted[0].score * 0.7 + sorted[1].score * 0.3);
      // Bonus si 2 failles >60% (dossier très solide)
      if (sorted.length >= 2 && sorted[0].score >= 70 && sorted[1].score >= 60) scoreGlobal = Math.min(98, scoreGlobal + 4);
    }

    // Lettre de recours (démo) : générée depuis le template de la faille
    // principale (la première candidate). Identité fictive pour l'échantillon.
    const faillePrincipale = resultats[0]
      ? faillesDb.find((f) => f.id === resultats[0].id) ?? null
      : null;
    const lettre = faillePrincipale
      ? remplirTemplate(faillePrincipale.templateLettre, data)
      : null;

    return new Response(
      JSON.stringify({
        simulation: true,
        message:
          "Simulation de démonstration : le scan détecte des failles par règles automatiques et génère une lettre de recours à partir du template de la faille retenue. Les propositions « à valider » ne sont pas encore retenues par la base juridique. Ce résultat ne constitue pas un avis juridique et reste soumis à la validation d'un juriste.",
        texte,
        data,
        scoreGlobal,
        simule,
        lettre,
        lettreFaille: faillePrincipale
          ? {
              titre: faillePrincipale.titreFaille,
              articleLoi: faillePrincipale.articleLoi,
              statut: faillePrincipale.statut,
            }
          : null,
        resultats,
      }),
      { headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        erreur: `Erreur pendant la démonstration : ${(e as Error).message}`,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

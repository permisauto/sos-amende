"use client";

import { useMemo } from "react";

/**
 * Surligne, dans le texte brut du document, les valeurs déjà extraites par
 * l'OCR (plaque, numéro, date, montant, nom, adresse…). Objectif : guider le
 * client dans sa relecture — ce qui est en vert est déjà capté, le reste reste
 * à saisir/corriger. Aucune logique métier : simple correspondance de chaînes
 * (insensible casse/accents), bornée à des valeurs non triviales.
 */
export function PvSurligne({
  texte,
  valeurs,
}: {
  texte: string;
  valeurs: Record<string, unknown>;
}) {
  const segments = useMemo(() => {
    const sortables: string[] = [];
    const CHAMPS = [
      "nom",
      "prenom",
      "plaque",
      "num_pv",
      "date",
      "heure",
      "montant",
      "adresse",
      "lieu",
      "prefecture",
      "duree",
      "motif",
      "neph",
      "soldePoints",
      "pointsEncourus",
      "numTelePaiement",
      "radarId",
      "typeRadar",
    ];
    for (const c of CHAMPS) {
      const v = valeurs[c];
      if (typeof v !== "string") continue;
      const nettoye = v.trim();
      if (nettoye.length < 2) continue;
      // Évite de surligner des valeurs trop génériques (un mot très court).
      if (nettoye.length < 3 && !/^\d/.test(nettoye)) continue;
      sortables.push(nettoye);
    }
    // Déduplication + tri par longueur décroissante (surlig. prioritaire).
    const uniques = Array.from(new Set(sortables)).sort(
      (a, b) => b.length - a.length,
    );
    if (uniques.length === 0) return [{ texte, hit: false }];

    // Échappement des métacaractères regex.
    const echappe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `(${uniques.map(echappe).join("|")})`,
      "gi",
    );
    return texte.split(re).map((part) => {
      const hit = uniques.some(
        (u) => u.toLowerCase() === part.toLowerCase(),
      );
      return { texte: part, hit };
    });
  }, [texte, valeurs]);

  return (
    <>
      {segments.map((s, i) =>
        s.hit ? (
          <mark key={i} className="rounded bg-emerald-200 px-0.5 text-emerald-900">
            {s.texte}
          </mark>
        ) : (
          <span key={i}>{s.texte}</span>
        ),
      )}
    </>
  );
}
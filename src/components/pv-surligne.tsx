"use client";

import { useMemo } from "react";

/**
 * Surligne, dans le texte brut du document, les valeurs déjà extraites par
 * l'OCR (plaque, numéro, date, montant, nom, adresse…) en **vert**, et les
 * **libellés de champs** (Nom, Plaque, N°, Date…) en **ambre** quand la valeur
 * associée n'a pas été captée. Objectif : guider le client dans sa relecture —
 * vert = déjà reconnu, ambre = à copier-coller/remplir. Aucune logique métier.
 */

const LIBELLES = [
  "Nom",
  "Prénom",
  "Plaque",
  "Immatriculation",
  "N°",
  "N° de l'avis",
  "Numéro",
  "Date",
  "Heure",
  "Montant",
  "Adresse",
  "Lieu",
  "NEPH",
  "Solde",
  "N° Permis",
  "Titulaire",
  "Destinataire",
  "Redevable",
];

const echappe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function PvSurligne({
  texte,
  valeurs,
}: {
  texte: string;
  valeurs: Record<string, unknown>;
}) {
  const segments = useMemo(() => {
    // 1. Valeurs captées (vert).
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
    const captees: string[] = [];
    for (const c of CHAMPS) {
      const v = valeurs[c];
      if (typeof v !== "string") continue;
      const n = v.trim();
      if (n.length < 2) continue;
      if (n.length < 3 && !/^\d/.test(n)) continue;
      captees.push(n);
    }
    const uniques = Array.from(new Set(captees)).sort(
      (a, b) => b.length - a.length,
    );

    // 2. Libellés de champs (ambre) : insensibles casse/accents.
    const motifs = [
      ...uniques.map(echappe),
      ...LIBELLES.map(echappe),
    ];
    if (motifs.length === 0) return [{ texte, type: "brut" as const }];

    const re = new RegExp(`(${motifs.join("|")})`, "gi");
    return texte.split(re).map((part) => {
      if (!part) return { texte: "", type: "brut" as const };
      const valHit = uniques.some((u) => u.toLowerCase() === part.toLowerCase());
      if (valHit) return { texte: part, type: "vert" as const };
      const libelleHit = LIBELLES.some(
        (l) => l.toLowerCase() === part.toLowerCase(),
      );
      return { texte: part, type: libelleHit ? "ambre" as const : "brut" as const };
    });
  }, [texte, valeurs]);

  return (
    <>
      {segments.map((s, i) =>
        s.type === "vert" ? (
          <mark key={i} className="rounded bg-emerald-200 px-0.5 text-emerald-900">
            {s.texte}
          </mark>
        ) : s.type === "ambre" ? (
          <mark key={i} className="rounded bg-amber-200 px-0.5 text-amber-900">
            {s.texte}
          </mark>
        ) : (
          <span key={i}>{s.texte}</span>
        ),
      )}
    </>
  );
}
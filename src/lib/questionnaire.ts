import type { RegleDetection } from "@/lib/moteur";

export type Question = {
  id: string; // faille id
  champ: string; // clé dans ExtractedData
  label: string;
  type: "boolean";
  articleLoi: string;
  regle: string | null;
  failleId: string;
};

// Génère le questionnaire à partir des failles ACTIVE — chaque nouvelle faille validée par l'admin enrichit automatiquement le questionnaire
export function questionsDepuisFailles(
  failles: Array<{ id: string; titreFaille: string; articleLoi: string; regle: string | null; reglesDetection: unknown }>,
): Question[] {
  const map: Record<string, { champ: string; label: string }> = {
    travauxPresents: { champ: "travaux_présents", label: "Travaux présents sur la route ce jour-là" },
    meteoDefavorable: { champ: "conditions_meteo", label: "Conditions météo défavorables (pluie/brouillard/verglas)" },
    vehiculeCede: { champ: "vehiculeCede", label: "Véhicule vendu/cédé avant la date de l'infraction" },
    vehiculeVole: { champ: "vehiculeVole", label: "Véhicule volé / plaque usurpée" },
    conducteurDifferent: { champ: "conducteurDifferent", label: "Je n'étais pas au volant" },
    plaqueIncorrecte: { champ: "plaqueIncorrecte", label: "Plaque sur le PV incorrecte" },
    adresseIncorrecte: { champ: "adresseIncorrecte", label: "Adresse / lieu sur le PV incorrect" },
    paiementDejaFait: { champ: "paiementDejaFait", label: "J'ai déjà payé cette amende" },
    datePrescrite: { champ: "datePrescrite", label: "Infraction de plus d'un an" },
    etalonnageExpire: { champ: "etalonnageExpire", label: "Radar — certificat d'étalonnage expiré" },
    champAbsent: { champ: "champAbsent", label: "Mention manquante sur l'avis" },
  };

  const questions: Question[] = [];
  const seen = new Set<string>();

  for (const f of failles) {
    const regles = (f.reglesDetection as RegleDetection[] | null) ?? [];
    for (const r of regles) {
      const key = r.type;
      if (!map[key] || seen.has(key)) continue;
      // Pour champAbsent, on génère une question générique par champ manquant
      if (key === "champAbsent") {
        const champ = (r as { champ: string }).champ;
        const id = `${f.id}:${champ}`;
        if (seen.has(id)) continue;
        seen.add(id);
        questions.push({
          id,
          champ,
          label: `Mention manquante : ${champ}`,
          type: "boolean",
          articleLoi: f.articleLoi,
          regle: f.regle,
          failleId: f.id,
        });
        continue;
      }
      seen.add(key);
      questions.push({
        id: f.id,
        champ: map[key].champ,
        label: map[key].label,
        type: "boolean",
        articleLoi: f.articleLoi,
        regle: f.regle,
        failleId: f.id,
      });
    }
  }

  // Fallback : si aucune faille n'a de règle questionnaire, on garde les 8 de base
  if (questions.length === 0) {
    return [
      { id: "fallback-paiement", champ: "paiementDejaFait", label: "J'ai déjà payé cette amende", type: "boolean", articleLoi: "Art. 529-2 CPP", regle: null, failleId: "faille-paiement-deja-effectue" },
      { id: "fallback-cession", champ: "vehiculeCede", label: "Véhicule vendu/cédé avant la date", type: "boolean", articleLoi: "Art. 529-10 CPP", regle: null, failleId: "faille-cession-vehicule" },
    ];
  }

  return questions;
}

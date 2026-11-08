import { describe, expect, it } from "vitest";
import { normaliserPv } from "./ocr";
import { detecterProcedure } from "./procedure";
import { libelleCategorie, lireCategorie } from "./doc-v2";

/**
 * Corpus de référence (golden set) — non-régression du cerveau juridique sur
 * les documents simulés du provider mock. Chaque entrée verrouille le résultat
 * attendu de la chaîne OCR → classement → voie de procédure : si une régression
 * casse la détection d'un vrai cas, ce fichier échoue.
 *
 * Les textes reproduisent les fixtures `MOCK_*` d'`ocr.ts` (leur substance, sans
 * dépendre de l'implémentation interne) : c'est le référentiel de comportement
 * attendu, pas une copie des constantes.
 */

type Cas = {
  nom: string;
  texte: string;
  attente: {
    plaque: string | undefined;
    montant: string | undefined;
    voie: string;
  };
};

const cas: Cas[] = [
  {
    nom: "amende simple (3e classe)",
    texte:
      "CONTRAVENTION\nN° 123456789\nTitulaire : MARTIN Jean\nAdresse : 12 RUE DE LA PAIX 75001 PARIS\nInfraction commise le 01/07/2026 à 14h32.\nVéhicule : AB-123-CD\nMontant : 68 €\nN° de télé-paiement 123456789, clé 02",
    attente: { plaque: "AB-123-CD", montant: "68,00 €", voie: "AMENDE_FORFAITAIRE" },
  },
  {
    nom: "contentieux (4e classe, 135 €)",
    texte:
      "CONTRAVENTION\nN° 123456789\nTitulaire : MARTIN Jean\nAdresse : 12 RUE DE LA PAIX 75001 PARIS\nInfraction commise le 01/07/2026 à 14h32.\nVéhicule : AB-123-CD\nMontant : 135 €\nN° de télé-paiement 123456789, clé 02",
    attente: { plaque: "AB-123-CD", montant: "135,00 €", voie: "CONTENTIEUX_CONTRAVENTION" },
  },
  {
    nom: "suspension 3F (arrêté préfectoral)",
    texte:
      "ARRÊTÉ PRÉFECTORAL N° 2026-0451\nPréfecture du Rhône\nTitulaire : MARTIN Jean\nARRÊTÉ DE SUSPENSION DU PERMIS DE CONDUIRE\nVéhicule : AB-123-CD\nMotif : excès de vitesse\nFait à Lyon, le 05/07/2026 à 09h00",
    attente: { plaque: "AB-123-CD", montant: undefined, voie: "INCONNU" },
  },
  {
    nom: "invalidation 48SI (solde de points nul)",
    texte:
      "LETTRE 48 SI\nINVALIDATION DE MON PERMIS DE CONDUIRE POUR SOLDE DE POINTS NUL\nTitulaire : MARTIN Jean\nRécapitulatif des retraits :\n05/03/2026 : retrait de 6 points\nNotifiée le 20/03/2026",
    attente: { plaque: undefined, montant: undefined, voie: "INCONNU" },
  },
];

describe("corpus de référence (golden set)", () => {
  for (const c of cas) {
    it(`détecte correctement : ${c.nom}`, () => {
      const extrait = normaliserPv(c.texte);
      expect(extrait.plaque).toBe(c.attente.plaque);
      expect(extrait.montant).toBe(c.attente.montant);
      const procedure = detecterProcedure({ montant: extrait.montant, texte: c.texte });
      expect(procedure.voie).toBe(c.attente.voie);
    });
  }

  it("reste hermetique : pas de plaque inventée hors « véhicule »", () => {
    // Un texte sans mention de véhicule ne doit jamais produire une plaque.
    const extrait = normaliserPv(
      "Décision administrative sans immatriculation.\nLe requérant conteste la sanction.",
    );
    expect(extrait.plaque).toBeUndefined();
  });
});

describe("catégories documentaires (doc-v2)", () => {
  it("reconnaît les catégories du référentiel", () => {
    expect(lireCategorie("AMENDE_ANTAI")).toBe("AMENDE_ANTAI");
    expect(lireCategorie("INCONNU")).toBe("INCONNU");
    expect(lireCategorie("pas-une-categorie")).toBeUndefined();
    expect(libelleCategorie("SUSPENSION_PREFECTORALE")).toBeTruthy();
  });
});
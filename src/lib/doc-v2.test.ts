import { describe, expect, it } from "vitest";
import { CATEGORIES_DOCUMENT } from "./moteur";
import {
  alignerDocType,
  aplatirDocV2,
  docTypePourCategorie,
  libelleCategorie,
  lireCategorie,
  normaliserCategorie,
  parserDocV2,
} from "./doc-v2";

describe("doc-v2 — catégories", () => {
  it("normalise casse, espaces et tirets", () => {
    expect(normaliserCategorie("amende_antai")).toBe("AMENDE_ANTAI");
    expect(normaliserCategorie(" Suspension  Prefectorale ")).toBe(
      "SUSPENSION_PREFECTORALE",
    );
    expect(normaliserCategorie("PERTE-POINTS-48")).toBe("PERTE_POINTS_48");
  });

  it("refuse tout ce qui n'est pas une catégorie du contrat (jamais inventée)", () => {
    expect(normaliserCategorie("AMENDE_SIMPLE")).toBeUndefined();
    expect(normaliserCategorie("")).toBeUndefined();
    expect(normaliserCategorie(null)).toBeUndefined();
    expect(normaliserCategorie(42)).toBeUndefined();
    expect(lireCategorie(undefined)).toBeUndefined();
  });

  it("mappe chaque catégorie vers son docType pack (ou rien)", () => {
    expect(docTypePourCategorie("AMENDE_ANTAI")).toBe("AMENDE");
    expect(docTypePourCategorie("RETENTION_TERRAIN")).toBe("3F");
    expect(docTypePourCategorie("SUSPENSION_PREFECTORALE")).toBe("3F");
    expect(docTypePourCategorie("INVALIDATION_48SI")).toBe("48SI");
    expect(docTypePourCategorie("PERTE_POINTS_48")).toBeUndefined();
    expect(docTypePourCategorie("ANNULATION_JUDICIAIRE")).toBeUndefined();
    expect(docTypePourCategorie("INCONNU")).toBeUndefined();
  });

  it("a un libellé non vide pour les 7 catégories", () => {
    for (const cat of CATEGORIES_DOCUMENT) {
      expect(libelleCategorie(cat)).toBeTruthy();
    }
    expect(libelleCategorie("SUSPENSION_PREFECTORALE")).toBe(
      "suspension préfectorale (3F)",
    );
  });
});

describe("doc-v2 — parserDocV2", () => {
  const complet = {
    categorie: "AMENDE_ANTAI",
    statut_import: {
      identifiant_document: "37592048152634",
      numero_neph_dossier: "1A2B3C4D5E6F",
      date_emission_officielle: "2026-04-14",
      date_notification_mentionnee: null,
    },
    profil_client: {
      nom: "MARTIN",
      prenom: "Jean",
      adresse_postale_brute: "15 Rue des Lilas 75011 PARIS",
    },
    faits_et_infraction: {
      date_faits: "2026-07-01",
      heure_faits: "14:32",
      lieu_exact: "Avenue de la République - METZ",
      nature_infraction_libelle: "Excès de vitesse",
      immatriculation_vehicule: "AB-123-CD",
    },
    impact_et_sanctions_financieres: {
      montant_amende_euros: 135,
      retrait_points_encouru: 2,
      solde_points_apres_infraction: 0,
      duree_retrait_permis_mois: null,
      mesure_technique: null,
    },
  };

  it("parse un objet complet et écarte les nulls (sections vides → absentes)", () => {
    const doc = parserDocV2(complet);
    expect(doc?.categorie).toBe("AMENDE_ANTAI");
    expect(doc?.statut_import?.identifiant_document).toBe("37592048152634");
    expect(doc?.statut_import?.date_notification_mentionnee).toBeUndefined();
    expect(doc?.profil_client?.nom).toBe("MARTIN");
    expect(doc?.faits_et_infraction?.heure_faits).toBe("14:32");
    expect(doc?.impact_et_sanctions_financieres?.montant_amende_euros).toBe(135);
    expect(doc?.impact_et_sanctions_financieres?.duree_retrait_permis_mois)
      .toBeUndefined();
    expect(doc?.impact_et_sanctions_financieres?.mesure_technique).toBeUndefined();
  });

  it("racine non objet → null (jamais d'exception)", () => {
    expect(parserDocV2(null)).toBeNull();
    expect(parserDocV2("texte libre")).toBeNull();
    expect(parserDocV2([1, 2, 3])).toBeNull();
    expect(parserDocV2(undefined)).toBeNull();
  });

  it("catégorie absente ou invalide → null (texte laissé aux regex)", () => {
    expect(parserDocV2({ statut_import: { identifiant_document: "123" } })).toBeNull();
    expect(parserDocV2({ categorie: "UN Autre", profil_client: {} })).toBeNull();
  });

  it("isole les champs invalides : les autres survivent", () => {
    const doc = parserDocV2({
      categorie: "invalidation_48si",
      statut_import: {
        identifiant_document: 12345, // type invalide
        date_emission_officielle: "2026-13-45", // date absurde
      },
      faits_et_infraction: {
        date_faits: "2026-03-20",
        heure_faits: "25:99", // heure absurde
        immatriculation_vehicule: "AB-123-CD",
      },
      impact_et_sanctions_financieres: {
        montant_amende_euros: "135,00", // chaîne décimale tolérée
        solde_points_apres_infraction: 4,
      },
    });
    expect(doc?.categorie).toBe("INVALIDATION_48SI");
    expect(doc?.statut_import?.identifiant_document).toBeUndefined();
    expect(doc?.statut_import?.date_emission_officielle).toBeUndefined();
    expect(doc?.faits_et_infraction?.date_faits).toBe("2026-03-20");
    expect(doc?.faits_et_infraction?.heure_faits).toBeUndefined();
    expect(doc?.faits_et_infraction?.immatriculation_vehicule).toBe("AB-123-CD");
    expect(doc?.impact_et_sanctions_financieres?.montant_amende_euros).toBe(135);
    expect(doc?.impact_et_sanctions_financieres?.solde_points_apres_infraction).toBe(4);
  });

  it("section de type inattendu → ignorée sans perdre les autres", () => {
    const doc = parserDocV2({
      categorie: "RETENTION_TERRAIN",
      profil_client: "n/a",
      faits_et_infraction: { lieu_exact: "Gare de Lyon" },
    });
    expect(doc?.profil_client).toBeUndefined();
    expect(doc?.faits_et_infraction?.lieu_exact).toBe("Gare de Lyon");
  });

  it("tolère une forme aplatie (sections rejetées sur la racine)", () => {
    const doc = parserDocV2({
      categorie: "PERTE_POINTS_48",
      identifiant_document: "48N-2026-00451",
      nom: "DUPONT",
      prenom: "Marie",
      date_faits: "2026-05-10",
      solde_points_apres_infraction: 4,
    });
    expect(doc?.statut_import?.identifiant_document).toBe("48N-2026-00451");
    expect(doc?.profil_client?.nom).toBe("DUPONT");
    expect(doc?.faits_et_infraction?.date_faits).toBe("2026-05-10");
    expect(doc?.impact_et_sanctions_financieres?.solde_points_apres_infraction).toBe(4);
  });

  it("mesure technique : unité inconnue ou chiffre absent → pas de mesure", () => {
    const sansUnite = parserDocV2({
      categorie: "ANNULATION_JUDICIAIRE",
      impact_et_sanctions_financieres: {
        mesure_technique: { chiffre_mesure: 0.85, unite: "ppm" },
      },
    });
    expect(
      sansUnite?.impact_et_sanctions_financieres?.mesure_technique,
    ).toBeUndefined();

    const complete = parserDocV2({
      categorie: "ANNULATION_JUDICIAIRE",
      impact_et_sanctions_financieres: {
        mesure_technique: {
          chiffre_mesure: "0,85",
          unite: "mg/L",
          chiffre_retenu: 0.9,
        },
      },
    });
    expect(
      complete?.impact_et_sanctions_financieres?.mesure_technique,
    ).toEqual({ valeur: 0.85, unite: "mg/L", retenu: 0.9 });
  });
});

describe("doc-v2 — aplatirDocV2 (miroir clés plates)", () => {
  const doc = parserDocV2({
    categorie: "suspension_prefectorale",
    statut_import: {
      identifiant_document: "DEC-2026-0421",
      numero_neph_dossier: "0751 2345 6789",
      date_emission_officielle: "2026-07-05",
      date_notification_mentionnee: "2026-07-08",
    },
    profil_client: { nom: "MARTIN", prenom: "Jean" },
    faits_et_infraction: {
      date_faits: "2026-07-01",
      heure_faits: "14:32",
      lieu_exact: "Avenue de la République",
      nature_infraction_libelle: "Excès de vitesse -",
      immatriculation_vehicule: "ab 123 cd (F)",
    },
    impact_et_sanctions_financieres: {
      montant_amende_euros: 135,
      duree_retrait_permis_mois: 6,
      retrait_points_encouru: 2,
      solde_points_apres_infraction: 0,
    },
  });
  if (!doc) throw new Error("fixture invalide");

  it("reflète les champs exploitables au format attendu", () => {
    const m = aplatirDocV2(doc);
    expect(m.categorie).toBe("SUSPENSION_PREFECTORALE");
    expect(m.nom).toBe("MARTIN Jean");
    expect(m.date).toBe("2026-07-01");
    expect(m.heure).toBe("14h32");
    expect(m.lieu).toBe("Avenue de la République");
    expect(m.libelleInfraction).toBe("Excès de vitesse");
    expect(m.plaque).toBe("AB-123-CD");
    expect(m.montant).toBe("135,00 €");
    expect(m.duree).toBe("6 mois");
    expect(m.pointsEncourus).toBe("2");
    expect(m.soldePoints).toBe("0");
    expect(m.dateEmission).toBe("2026-07-05");
    expect(m.dateNotification).toBe("2026-07-08");
    expect(m.neph).toBe("075123456789");
    expect(m.doc_v2).toBe(doc);
  });

  it("ne pose ni docType ni plaque invalide", () => {
    const brut = parserDocV2({
      categorie: "AMENDE_ANTAI",
      statut_import: { identifiant_document: "1234567" }, // 7 chiffres
      faits_et_infraction: { immatriculation_vehicule: "IMMATRICULATION INCONNUE" },
    });
    const m = aplatirDocV2(brut!);
    expect(m.docType).toBeUndefined();
    expect(m.num_pv).toBeUndefined();
    expect(m.plaque).toBeUndefined();
  });

  it("un n° d'avis de 14 chiffres (avec séparateurs) est conservé", () => {
    const brut = parserDocV2({
      categorie: "AMENDE_ANTAI",
      statut_import: { identifiant_document: "3759 2048 1526 34" },
    });
    expect(aplatirDocV2(brut!).num_pv).toBe("37592048152634");
  });

  it("INCONNU est conservé dans le miroir (classé, pas inventé)", () => {
    const inconnu = parserDocV2({ categorie: "INCONNU", texte: "…" });
    expect(aplatirDocV2(inconnu!).categorie).toBe("INCONNU");
  });
});

describe("doc-v2 — alignerDocType", () => {
  it("catégorie absente → no-op (anciens dossiers conservent leur docType)", () => {
    const data: Record<string, unknown> = { docType: "3F", nom: "X" };
    alignerDocType(data);
    expect(data.docType).toBe("3F");
    expect(data.categorie).toBeUndefined();
  });

  it("catégories pack → docType aligné", () => {
    for (const [cat, attendu] of [
      ["SUSPENSION_PREFECTORALE", "3F"],
      ["RETENTION_TERRAIN", "3F"],
      ["INVALIDATION_48SI", "48SI"],
      ["AMENDE_ANTAI", "AMENDE"],
    ] as const) {
      const data: Record<string, unknown> = { categorie: cat };
      alignerDocType(data);
      expect(data.docType).toBe(attendu);
      expect(data.categorie).toBe(cat);
    }
  });

  it("catégories hors pack → docType supprimé (jamais de mismatch)", () => {
    const data: Record<string, unknown> = {
      categorie: "PERTE_POINTS_48",
      docType: "3F",
    };
    alignerDocType(data);
    expect(data.docType).toBeUndefined();
    expect(data.categorie).toBe("PERTE_POINTS_48");
  });

  it("catégorie invalide → les deux clés supprimées", () => {
    const data: Record<string, unknown> = { categorie: "n'importe quoi", docType: "48SI" };
    alignerDocType(data);
    expect(data.categorie).toBeUndefined();
    expect(data.docType).toBeUndefined();
  });

  it("normalise la catégorie écrite avec une casse libre", () => {
    const data: Record<string, unknown> = { categorie: " invalidation 48si " };
    alignerDocType(data);
    expect(data.categorie).toBe("INVALIDATION_48SI");
    expect(data.docType).toBe("48SI");
  });
});

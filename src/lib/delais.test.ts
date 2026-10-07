import { describe, expect, it } from "vitest";

import {
  ajouterJoursFrances,
  controlerForclusion48si,
  estJourFerie,
  estJourOuvrable,
  reporterJourOuvrable,
} from "./delais";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("estJourFerie (métropole)", () => {
  it("connaît les fériés fixes", () => {
    expect(estJourFerie(d("2026-01-01"))).toBe(true); // 1er janvier
    expect(estJourFerie(d("2026-05-01"))).toBe(true); // 1er mai
    expect(estJourFerie(d("2026-05-08"))).toBe(true); // 8 mai
    expect(estJourFerie(d("2026-07-14"))).toBe(true); // Fête nationale
    expect(estJourFerie(d("2026-08-15"))).toBe(true); // Assomption
    expect(estJourFerie(d("2026-11-01"))).toBe(true); // Toussaint
    expect(estJourFerie(d("2026-11-11"))).toBe(true); // Armistice
    expect(estJourFerie(d("2026-12-25"))).toBe(true); // Noël
  });

  it("calcule les fériés mobiles de Pâques (2026 : Pâques le 5 avril)", () => {
    expect(estJourFerie(d("2026-04-05"))).toBe(false); // dimanche de Pâques (pas férié ouvrable)
    expect(estJourFerie(d("2026-04-06"))).toBe(true); // lundi de Pâques
    expect(estJourFerie(d("2026-05-14"))).toBe(true); // Ascension
    expect(estJourFerie(d("2026-05-25"))).toBe(true); // lundi de Pentecôte
  });

  it("les jours ordinaires ne sont pas fériés", () => {
    expect(estJourFerie(d("2026-10-07"))).toBe(false);
    expect(estJourFerie(d("2026-09-15"))).toBe(false);
  });
});

describe("estJourOuvrable", () => {
  it("week-end et jours fériés ne sont pas ouvrables", () => {
    expect(estJourOuvrable(d("2026-10-03"))).toBe(false); // samedi
    expect(estJourOuvrable(d("2026-10-04"))).toBe(false); // dimanche
    expect(estJourOuvrable(d("2026-07-14"))).toBe(false); // férié en semaine
    expect(estJourOuvrable(d("2026-10-07"))).toBe(true); // mercredi
    expect(estJourOuvrable(d("2026-10-05"))).toBe(true); // lundi
  });
});

describe("ajouterJoursFrances", () => {
  it("compte à partir du lendemain de l'acte (jour 1)", () => {
    expect(ajouterJoursFrances("2026-08-01", 45).toISOString()).toBe(
      "2026-09-15T00:00:00.000Z",
    );
    expect(ajouterJoursFrances("2026-08-01", 60).toISOString()).toBe(
      "2026-09-30T00:00:00.000Z",
    );
  });

  it("accepte un Date et tronque au jour (UTC)", () => {
    expect(ajouterJoursFrances(d("2026-08-01"), 1).toISOString()).toBe(
      "2026-08-02T00:00:00.000Z",
    );
  });

  it("refuse une date invalide sans fabriquer de délai", () => {
    expect(Number.isNaN(ajouterJoursFrances("not-a-date", 45).getTime())).toBe(true);
  });
});

describe("reporterJourOuvrable", () => {
  it("reporte week-end et fériés, laisse les jours ouvrables", () => {
    expect(reporterJourOuvrable(d("2026-10-03")).toISOString()).toBe(
      "2026-10-05T00:00:00.000Z",
    ); // samedi → lundi
    expect(reporterJourOuvrable(d("2026-10-04")).toISOString()).toBe(
      "2026-10-05T00:00:00.000Z",
    ); // dimanche → lundi
    expect(reporterJourOuvrable(d("2026-07-14")).toISOString()).toBe(
      "2026-07-15T00:00:00.000Z",
    ); // mardi férié → mercredi
    expect(reporterJourOuvrable(d("2026-10-07")).toISOString()).toBe(
      "2026-10-07T00:00:00.000Z",
    ); // mercredi → inchangé
  });

  it("enchaîne sur plusieurs jours non ouvrables (vendredi férié)", () => {
    // 2026-05-08 (vendredi férié) → lundi 11 mai.
    expect(reporterJourOuvrable(d("2026-05-08")).toISOString()).toBe(
      "2026-05-11T00:00:00.000Z",
    );
  });
});

describe("controlerForclusion48si (60 jours francs + report ouvrable)", () => {
  it("sans date de notification, aucun signal (jamais de forclusion fabriquée)", () => {
    expect(controlerForclusion48si(null)).toBeNull();
    expect(controlerForclusion48si(undefined)).toBeNull();
    expect(controlerForclusion48si("")).toBeNull();
    expect(controlerForclusion48si("n'importe quoi")).toBeNull();
  });

  it("forclusion = notification + 60 jours francs", () => {
    const r = controlerForclusion48si("2026-08-01", d("2026-09-30"));
    expect(r).not.toBeNull();
    expect(r?.dateForclusion.toISOString()).toBe("2026-09-30T00:00:00.000Z");
    expect(r?.depasse).toBe(false);
    expect(r?.joursDepasse).toBe(0);
  });

  it("détecte le dépassement (forclusion dépassée → signal juriste)", () => {
    const r = controlerForclusion48si("2026-08-01", d("2026-10-02"));
    expect(r?.depasse).toBe(true);
    expect(r?.joursDepasse).toBe(2);
  });

  it("reporte une forclusion tombant le week-end", () => {
    // Notification 2026-06-10 + 60 j = 2026-08-09 (dimanche) → lundi 10 août.
    const r = controlerForclusion48si("2026-06-10", d("2026-08-10"));
    expect(r?.dateForclusion.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(r?.depasse).toBe(false);
  });

  it("le jour même de la forclusion reste dans les délais, le lendemain non", () => {
    const jourJour = controlerForclusion48si("2026-08-01", d("2026-10-03"));
    // Forclusion 09/30 (mercredi ouvrable) → 03/10 (samedi) la dépasse déjà de 3 j.
    expect(jourJour?.depasse).toBe(true);
    expect(jourJour?.joursDepasse).toBe(3);
  });
});

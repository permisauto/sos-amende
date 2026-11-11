import { describe, expect, it } from "vitest";
import { SUJETS_CONTACT, validerContact } from "./contact-form";

const valide = {
  nom: "Jean Dupont",
  email: "jean.dupont@example.fr",
  sujet: SUJETS_CONTACT[0],
  dossier: "",
  message: "Bonjour, j'ai une question sur le fonctionnement du service.",
  site: "",
};

describe("validerContact", () => {
  it("accepte un message valide", () => {
    const r = validerContact(valide);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.nom).toBe("Jean Dupont");
      expect(r.data.email).toBe("jean.dupont@example.fr");
    }
  });

  it("refuse un email invalide", () => {
    const r = validerContact({ ...valide, email: "pas-un-email" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreur).toContain("e-mail");
  });

  it("refuse un message trop court", () => {
    const r = validerContact({ ...valide, message: "court" });
    expect(r.ok).toBe(false);
  });

  it("refuse un sujet hors liste", () => {
    const r = validerContact({ ...valide, sujet: "Sujet inconnu" });
    expect(r.ok).toBe(false);
  });

  it("refuse un champ site rempli (piège anti-robot)", () => {
    const r = validerContact({ ...valide, site: "http://spam.example" });
    expect(r.ok).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  departementDepuisAdresse,
  destinataireRequete,
  tribunalPourAdresse,
  tribunalPourDepartement,
} from "./tribunal-administratif";

describe("tribunal-administratif — ressort par département (R. 221-3 CJA)", () => {
  it("déduit le département depuis le code postal", () => {
    expect(departementDepuisAdresse("12 RUE DE LA PAIX 75001 PARIS")).toBe("75");
    expect(departementDepuisAdresse("5 AV DU PORT 13002 MARSEILLE")).toBe("13");
    expect(departementDepuisAdresse("1 RUE 69001 LYON")).toBe("69");
    expect(departementDepuisAdresse("chez moi 44000 Nantes")).toBe("44");
    expect(departementDepuisAdresse("97400 SAINT-DENIS")).toBe("974");
    expect(departementDepuisAdresse("97110 POINTE-À-PITRE")).toBe("971");
  });

  it("sans code postal exploitable : null (aucune valeur devinée)", () => {
    expect(departementDepuisAdresse("12 RUE SANS CODE")).toBeNull();
    expect(departementDepuisAdresse("")).toBeNull();
    expect(departementDepuisAdresse(null)).toBeNull();
    expect(departementDepuisAdresse(undefined)).toBeNull();
    expect(departementDepuisAdresse("99999 NULPART")).toBeNull();
  });

  it("Corse : 20xxx → 2A (Corse-du-Sud) ou 2B (Haute-Corse)", () => {
    expect(departementDepuisAdresse("20000 AJACCIO")).toBe("2A");
    expect(departementDepuisAdresse("20190 SARTÈNE")).toBe("2A");
    expect(departementDepuisAdresse("20200 BASTIA")).toBe("2B");
    expect(departementDepuisAdresse("20600 BASTIA")).toBe("2B");
  });

  it("mappe le département vers le siège du TA", () => {
    expect(tribunalPourDepartement("75")).toBe("Paris");
    expect(tribunalPourDepartement("13")).toBe("Marseille");
    expect(tribunalPourDepartement("59")).toBe("Lille");
    expect(tribunalPourDepartement("67")).toBe("Strasbourg");
    expect(tribunalPourDepartement("93")).toBe("Montreuil");
    expect(tribunalPourDepartement("92")).toBe("Cergy-Pontoise");
    expect(tribunalPourDepartement("94")).toBe("Melun");
    expect(tribunalPourDepartement("2A")).toBe("Bastia");
    expect(tribunalPourDepartement("974")).toBe("Saint-Denis");
    expect(tribunalPourDepartement(null)).toBeNull();
    expect(tribunalPourDepartement("ZZ")).toBeNull();
  });

  it("TA territorialement compétent depuis l'adresse complète", () => {
    expect(tribunalPourAdresse("12 RUE 75001 PARIS")).toBe("Paris");
    expect(tribunalPourAdresse("3 RUE 67000 STRASBOURG")).toBe("Strasbourg");
    expect(tribunalPourAdresse("3 RUE 20000 AJACCIO")).toBe("Bastia");
    expect(tribunalPourAdresse("sans code postal")).toBeNull();
  });

  it("destinataireRequete nomme la juridiction quand elle est connue", () => {
    expect(destinataireRequete("Lyon")).toContain("Tribunal administratif de Lyon");
    expect(destinataireRequete(null)).toContain("Tribunal administratif");
    expect(destinataireRequete(null)).not.toContain("administratif de");
  });
});

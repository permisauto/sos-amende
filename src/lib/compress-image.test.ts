import { describe, expect, it } from "vitest";
import { dimensionsRedimensionnees } from "./compress-image";

describe("dimensionsRedimensionnees", () => {
  it("ne redimensionne pas sous la dimension max", () => {
    expect(dimensionsRedimensionnees(800, 600, 1600)).toEqual({
      largeur: 800,
      hauteur: 600,
    });
  });

  it("réduit le grand côté à la dimension max (ratio conservé)", () => {
    expect(dimensionsRedimensionnees(3200, 1600, 1600)).toEqual({
      largeur: 1600,
      hauteur: 800,
    });
  });

  it("gère le portrait", () => {
    expect(dimensionsRedimensionnees(1600, 3200, 1600)).toEqual({
      largeur: 800,
      hauteur: 1600,
    });
  });

  it("reste >= 1px", () => {
    expect(dimensionsRedimensionnees(3200, 1, 1600)).toEqual({
      largeur: 1600,
      hauteur: 1,
    });
  });
});

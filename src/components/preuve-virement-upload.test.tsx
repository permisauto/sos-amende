import { describe, expect, it } from "vitest";
import {
  isValidFile,
  TAILLE_MAX_PREUVE,
  TYPES_PREUVE_ACCEPTES,
} from "@/components/preuve-virement-upload";

describe("isValidFile (PreuveVirementUpload)", () => {
  it("refuse un fichier absent", () => {
    expect(isValidFile(null)).toBe(false);
    expect(isValidFile(undefined)).toBe(false);
  });

  it("accepte les quatre types autorisés", () => {
    for (const type of TYPES_PREUVE_ACCEPTES) {
      expect(isValidFile({ type, size: 1024 })).toBe(true);
    }
  });

  it("refuse un type non autorisé", () => {
    expect(isValidFile({ type: "text/plain", size: 1024 })).toBe(false);
    expect(isValidFile({ type: "image/gif", size: 1024 })).toBe(false);
  });

  it("refuse un fichier de plus de 8 Mo", () => {
    expect(isValidFile({ type: "application/pdf", size: TAILLE_MAX_PREUVE + 1 })).toBe(false);
  });

  it("accepte un fichier de exactement 8 Mo", () => {
    expect(isValidFile({ type: "application/pdf", size: TAILLE_MAX_PREUVE })).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  ecrireCacheOcr,
  hashBuffer,
  lireCacheOcr,
  viderCacheOcr,
} from "./ocr-cache";
import type { OcrResult } from "./ocr";

describe("ocr-cache (empreinte SHA-256)", () => {
  it("hashBuffer est déterministe et distinct", () => {
    const a = hashBuffer(Buffer.from("doc-a"));
    const b = hashBuffer(Buffer.from("doc-b"));
    expect(a).toBe(hashBuffer(Buffer.from("doc-a")));
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sert le résultat écrit jusqu'au vidage", () => {
    viderCacheOcr();
    const resultat: OcrResult = { texte: "CONTRAVENTION" };
    ecrireCacheOcr(hashBuffer(Buffer.from("x")), resultat);
    expect(lireCacheOcr(hashBuffer(Buffer.from("x")))?.texte).toBe(
      "CONTRAVENTION",
    );
    expect(lireCacheOcr(hashBuffer(Buffer.from("y")))).toBeNull();
    viderCacheOcr();
    expect(lireCacheOcr(hashBuffer(Buffer.from("x")))).toBeNull();
  });
});

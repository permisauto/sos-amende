import { afterEach, describe, expect, it } from "vitest";
import {
  ecrireCacheArticlesVeille,
  ecrireCacheHistoriqueVeille,
  invaliderCacheVeille,
  lireCacheArticlesVeille,
  lireCacheHistoriqueVeille,
} from "./veille-cache";

afterEach(() => {
  invaliderCacheVeille();
});

describe("veille-cache (TTL 5 min)", () => {
  it("retourne null avant toute écriture", () => {
    expect(lireCacheArticlesVeille()).toBeNull();
    expect(lireCacheHistoriqueVeille()).toBeNull();
  });

  it("sert la valeur écrite jusqu'à invalidation", () => {
    const set = new Set(["L224-2", "R47-1"]);
    ecrireCacheArticlesVeille(set);
    expect(lireCacheArticlesVeille()).toBe(set);

    const hist = new Map([
      ["L224-2", { failleId: "L224-2", gagnes: 3, perdus: 1 }],
    ]);
    ecrireCacheHistoriqueVeille(hist);
    expect(lireCacheHistoriqueVeille()).toBe(hist);
  });

  it("invaliderCacheVeille vide les deux caches", () => {
    ecrireCacheArticlesVeille(new Set(["L224-2"]));
    ecrireCacheHistoriqueVeille(new Map());
    invaliderCacheVeille();
    expect(lireCacheArticlesVeille()).toBeNull();
    expect(lireCacheHistoriqueVeille()).toBeNull();
  });
});

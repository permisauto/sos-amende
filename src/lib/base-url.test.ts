import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { baseUrlApp } from "./base-url";

describe("baseUrlApp", () => {
  const previousUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (previousUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousUrl;
    }
  });

  it("repli sur NEXT_PUBLIC_APP_URL hors contexte requête (tests/CLI)", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.prod";
    expect(await baseUrlApp("http://localhost:3000")).toBe("https://app.prod");
  });

  it("repli par défaut quand aucune variable n'est définie", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(await baseUrlApp("http://localhost:3200")).toBe("http://localhost:3200");
  });

  it("en production sans variable, retourne le domaine réel (jamais localhost)", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    vi.stubEnv("NODE_ENV", "production");
    expect(await baseUrlApp()).toBe("https://recours-permis-pv.com");
    expect(await baseUrlApp("http://localhost:3200")).toBe(
      "https://recours-permis-pv.com",
    );
  });

  it("NEXT_PUBLIC_APP_URL prime sur le repli même en production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_APP_URL = "https://app.prod";
    expect(await baseUrlApp("http://localhost:3000")).toBe("https://app.prod");
  });
});
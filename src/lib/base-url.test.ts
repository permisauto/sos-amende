import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { baseUrlApp } from "./base-url";

describe("baseUrlApp", () => {
  const previousUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
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
});
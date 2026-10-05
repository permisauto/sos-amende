import { afterEach, describe, expect, it, vi } from "vitest";
import { secretsEgaux, verifierSecretCron } from "./cron-auth";

function req(bearer?: string): Request {
  return new Request("http://localhost/api/cron/test", {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  });
}

describe("secretsEgaux — comparaison à temps constant", () => {
  it("égalité exacte", () => {
    expect(secretsEgaux("s3cret", "s3cret")).toBe(true);
    expect(secretsEgaux("", "")).toBe(true);
  });

  it("inégalité sans exception, même avec des longueurs différentes", () => {
    // timingSafeEqual lèverait sur des tampons de longueurs différentes :
    // on hash les deux côtés en sha256 — jamais d'exception, jamais de !==.
    expect(secretsEgaux("abc", "abcd")).toBe(false);
    expect(secretsEgaux("court", "beaucoup-plus-long-que-lautre")).toBe(false);
    expect(secretsEgaux("abc", "abd")).toBe(false);
    expect(secretsEgaux("", "x")).toBe(false);
  });
});

describe("verifierSecretCron", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepte le bon Bearer, refuse tout le reste", () => {
    vi.stubEnv("CRON_SECRET", "mon-secret");
    expect(verifierSecretCron(req("mon-secret"))).toBe("ok");
    expect(verifierSecretCron(req("mauvais"))).toBe("non-autorise");
    expect(verifierSecretCron(req("mon-secretX"))).toBe("non-autorise");
    expect(verifierSecretCron(req())).toBe("non-autorise");
  });

  it("sans CRON_SECRET : ok en dev, refus (secret-absent) en production", () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(verifierSecretCron(req())).toBe("ok");
    vi.stubEnv("NODE_ENV", "production");
    expect(verifierSecretCron(req())).toBe("secret-absent");
  });

  it("accepte le header sans préfixe Bearer toléré (Bearer insensible à la casse)", () => {
    vi.stubEnv("CRON_SECRET", "mon-secret");
    expect(verifierSecretCron(req("mon-secret"))).toBe("ok");
    const sansPrefixe = new Request("http://localhost/api/cron/test", {
      headers: { authorization: "mon-secret" },
    });
    expect(verifierSecretCron(sansPrefixe)).toBe("ok");
  });
});

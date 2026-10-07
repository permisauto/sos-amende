import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    radarCalibration: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/preuves-api", () => ({
  rechercherRadar: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { rechercherRadar } from "@/lib/preuves-api";
import { contexteEtalonnage } from "@/lib/etalonnage";

const findFirst = vi.mocked(prisma.radarCalibration.findFirst);
const radar = vi.mocked(rechercherRadar);

beforeEach(() => {
  vi.resetAllMocks();
  findFirst.mockResolvedValue(null as never);
  radar.mockResolvedValue(null as never);
});

describe("contexteEtalonnage", () => {
  it("registre admin prioritaire : expiration + certificat, sans appel réseau", async () => {
    findFirst.mockResolvedValue({
      dateExpiration: new Date("2024-01-01T00:00:00Z"),
      preuveUrl: "https://x/certif.pdf",
    } as never);

    const res = await contexteEtalonnage({
      radarId: "1248",
      date: "2024-06-01",
      dateVerificationAppareil: "2020-01-01",
    });

    expect(res).toEqual({
      dateExpiration: new Date("2024-01-01T00:00:00Z"),
      preuveUrl: "https://x/certif.pdf",
    });
    expect(radar).not.toHaveBeenCalled();
  });

  it("sans registre : échéance calculée depuis la date de vérification du PV (+2 ans si poste fixe récent)", async () => {
    radar.mockResolvedValue({
      dateInstallation: "2022-06-01T00:00:00Z",
    } as never);

    const res = await contexteEtalonnage({
      radarId: "1248",
      date: "2023-06-01",
      dateVerificationAppareil: "2023-05-12",
    });

    expect(res.dateExpiration?.toISOString().slice(0, 10)).toBe("2025-05-12");
    expect(res.preuveUrl).toBeNull();
    expect(radar).toHaveBeenCalledWith({ radarId: "1248" });
  });

  it("liste des radars injoignable : échéance +1 an (jamais d'exception faute d'installation connue)", async () => {
    radar.mockRejectedValue(new Error("réseau"));

    const res = await contexteEtalonnage({
      radarId: "1248",
      date: "2024-06-01",
      dateVerificationAppareil: "2023-05-12",
    });

    expect(res.dateExpiration?.toISOString().slice(0, 10)).toBe("2024-05-12");
    expect(res.preuveUrl).toBeNull();
  });

  it("date de vérification postérieure au PV : incohérente, aucun contexte fabriqué", async () => {
    const res = await contexteEtalonnage({
      radarId: "1248",
      date: "2023-06-01",
      dateVerificationAppareil: "2023-07-01",
    });

    expect(res).toEqual({ dateExpiration: null, preuveUrl: null });
    expect(radar).not.toHaveBeenCalled();
  });

  it("dossier sans radar ni date de vérification : aucun contexte", async () => {
    expect(await contexteEtalonnage({})).toEqual({
      dateExpiration: null,
      preuveUrl: null,
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("registre en erreur (base injoignable) : jamais d'exception, aucun contexte", async () => {
    findFirst.mockRejectedValue(new Error("db down"));

    const res = await contexteEtalonnage({ radarId: "1248" });

    expect(res).toEqual({ dateExpiration: null, preuveUrl: null });
  });
});

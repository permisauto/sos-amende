import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import { extraireTarGz, TAILLE_MAX_ARCHIVE } from "@/lib/tar";

/** Construit un tar minimal (fichiers uniquement) pour les tests. */
function construireTar(entrees: { chemin: string; contenu: string }[]): Buffer {
  const blocs: Buffer[] = [];
  for (const e of entrees) {
    const data = Buffer.from(e.contenu, "utf8");
    const header = Buffer.alloc(512);
    header.write(e.chemin, 0, 100, "utf8");
    header.write("0000644\0", 100, 8, "ascii"); // mode
    header.write("0000000\0", 108, 8, "ascii"); // uid
    header.write("0000000\0", 116, 8, "ascii"); // gid
    header.write(data.length.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
    header.write("00000000000\0", 136, 12, "ascii"); // mtime
    header.write("        ", 148, 8, "ascii"); // checksum (placeholder)
    header.write("0", 156, 1, "ascii"); // typeflag = fichier régulier
    header.write("ustar\0", 257, 6, "ascii");
    blocs.push(header, data);
    const reste = data.length % 512;
    if (reste) blocs.push(Buffer.alloc(512 - reste));
  }
  blocs.push(Buffer.alloc(1024)); // deux blocs nuls = fin
  return Buffer.concat(blocs);
}

describe("tar — extraction", () => {
  it("extrait un fichier simple", () => {
    const gz = gzipSync(construireTar([{ chemin: "a/b.xml", contenu: "<A>bonjour</A>" }]));
    const entrees = extraireTarGz(gz);
    expect(entrees).toHaveLength(1);
    expect(entrees[0].chemin).toBe("a/b.xml");
    expect(entrees[0].contenu.toString("utf8")).toBe("<A>bonjour</A>");
  });

  it("extrait plusieurs fichiers en conservant l'ordre", () => {
    const gz = gzipSync(
      construireTar([
        { chemin: "un.xml", contenu: "1" },
        { chemin: "deux.xml", contenu: "2" },
        { chemin: "trois.xml", contenu: "3" },
      ]),
    );
    expect(extraireTarGz(gz).map((e) => e.chemin)).toEqual([
      "un.xml",
      "deux.xml",
      "trois.xml",
    ]);
  });

  it("gère un contenu de taille multiple de 512 (pas de remplissage)", () => {
    const contenu = "x".repeat(512);
    const gz = gzipSync(construireTar([{ chemin: "gros.xml", contenu }]));
    const entrees = extraireTarGz(gz);
    expect(entrees).toHaveLength(1);
    expect(entrees[0].contenu.toString("utf8")).toBe(contenu);
  });

  it("gère un contenu multi-octets (UTF-8 accentué)", () => {
    const gz = gzipSync(construireTar([{ chemin: "e.xml", contenu: "éàüç" }]));
    expect(extraireTarGz(gz)[0].contenu.toString("utf8")).toBe("éàüç");
  });

  it("retourne une liste vide pour une archive sans fichier", () => {
    expect(extraireTarGz(gzipSync(construireTar([])))).toEqual([]);
  });

  it("borne la taille d'archive acceptée", () => {
    expect(TAILLE_MAX_ARCHIVE).toBeLessThanOrEqual(64 * 1024 * 1024);
  });
});

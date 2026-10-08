import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { lireZip } from "@/lib/zip";

/**
 * Construit un ZIP valide à la main (en-têtes locaux + répertoire central +
 * EOCD) : évite d'écrire des fixtures binaires opaques et couvre réellement
 * les deux méthodes supportées (stored 0, deflate 8). Le CRC n'est pas
 * renseigné — le lecteur ne le vérifie pas (les archives DILA sont déjà
 * protégées par l'intégrité du téléchargement).
 */
function construireZip(
  entrees: Array<{ chemin: string; contenu: string; methode?: 0 | 8 }>,
): Buffer {
  const locaux: Buffer[] = [];
  const centraux: Buffer[] = [];
  let offset = 0;

  for (const e of entrees) {
    const brut = Buffer.from(e.contenu, "utf8");
    const methode = e.methode ?? 8;
    const donnees = methode === 8 ? deflateRawSync(brut) : brut;
    const nom = Buffer.from(e.chemin, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(methode, 8);
    local.writeUInt32LE(donnees.length, 18);
    local.writeUInt32LE(brut.length, 22);
    local.writeUInt16LE(nom.length, 26);
    locaux.push(local, nom, donnees);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(methode, 10);
    central.writeUInt32LE(donnees.length, 20);
    central.writeUInt32LE(brut.length, 24);
    central.writeUInt16LE(nom.length, 28);
    central.writeUInt32LE(offset, 42);
    centraux.push(central, nom);

    offset += 30 + nom.length + donnees.length;
  }

  const central = Buffer.concat(centraux);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entrees.length, 8);
  eocd.writeUInt16LE(entrees.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locaux, central, eocd]);
}

describe("lireZip", () => {
  it("extrait les entrées stored et deflate, ignore les répertoires", () => {
    const zip = construireZip([
      { chemin: "TA06/", contenu: "" },
      { chemin: "TA06/DTA_1.xml", contenu: "<Document>référé L. 521-1</Document>" },
      { chemin: "TA07/ORTA_2.xml", contenu: "ordonnance".repeat(50), methode: 0 },
      { chemin: "README.txt", contenu: "pas du XML" },
    ]);

    const entrees = [...lireZip(zip)];
    expect(entrees.map((e) => e.chemin)).toEqual([
      "TA06/DTA_1.xml",
      "TA07/ORTA_2.xml",
      "README.txt",
    ]);
    expect(entrees[0].contenu.toString("utf8")).toBe(
      "<Document>référé L. 521-1</Document>",
    );
    expect(entrees[1].contenu.toString("utf8")).toBe("ordonnance".repeat(50));
  });

  it("gère les entrées vides", () => {
    const zip = construireZip([{ chemin: "vide.xml", contenu: "" }]);
    const entrees = [...lireZip(zip)];
    expect(entrees).toHaveLength(1);
    expect(entrees[0].contenu).toHaveLength(0);
  });

  it("refuse un buffer sans répertoire central", () => {
    expect(() => [...lireZip(Buffer.from("ce n'est pas un zip"))]).toThrow(
      /EOCD/,
    );
  });

  it("refuse un zip64 (65 535+ entrées annoncées)", () => {
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0xffff, 10);
    expect(() => [...lireZip(eocd)]).toThrow(/zip64/);
  });

  it("refuse un répertoire central corrompu", () => {
    const zip = construireZip([{ chemin: "a.xml", contenu: "x" }]);
    // Casse la signature de la première entrée centrale.
    const eocdOffset = zip.length - 22;
    const cdOffset = zip.readUInt32LE(eocdOffset + 16);
    zip.writeUInt32LE(0xdeadbeef, cdOffset);
    expect(() => [...lireZip(zip)]).toThrow(/central/);
  });
});

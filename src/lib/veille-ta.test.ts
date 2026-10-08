import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import {
  analyserXmlTa,
  archiveTaCible,
  lirePublicationsTa,
  MARQUEUR_TA_RE,
  urlArchiveTa,
} from "@/lib/veille-ta";
import type { SourceDila } from "@/lib/veille-dila";

const XML_MODELE = `<?xml version="1.0" encoding="UTF-8"?>
<Document>
  <Donnees_Techniques>
    <Identification>DTA_2605706_20260901.xml</Identification>
    <Date_Mise_Jour>2026-09-02</Date_Mise_Jour>
  </Donnees_Techniques>
  <Dossier>
    <Code_Juridiction>TA06</Code_Juridiction>
    <Nom_Juridiction>Tribunal Administratif de Nice</Nom_Juridiction>
    <Numero_Dossier>2605706</Numero_Dossier>
    <Date_Lecture>2026-09-01</Date_Lecture>
    <Type_Decision>Décision</Type_Decision>
    <Type_Recours>Excès de pouvoir</Type_Recours>
    <Code_Publication>D</Code_Publication>
    <Solution>Rejet défaut de doute sérieux</Solution>
  </Dossier>
  <Decision>
    <Texte_Integral>
      Vu l'article R. 421-1 du code de justice administrative ;<br/>
      le stationnement en double file a été verbalisé.
    </Texte_Integral>
  </Decision>
</Document>`;

describe("archiveTaCible", () => {
  it("avant le 8 du mois : rien à faire (zip pas encore stabilisé)", () => {
    expect(archiveTaCible(new Date("2026-10-01T12:00:00Z"))).toBeNull();
    expect(archiveTaCible(new Date("2026-10-07T23:59:59Z"))).toBeNull();
  });

  it("à partir du 8 : le zip du mois précédent", () => {
    expect(archiveTaCible(new Date("2026-10-08T00:00:00Z"))).toBe("TA_202609.zip");
    expect(archiveTaCible(new Date("2026-10-31T23:00:00Z"))).toBe("TA_202609.zip");
    expect(archiveTaCible(new Date("2026-11-08T00:00:00Z"))).toBe("TA_202610.zip");
  });

  it("en janvier, vise décembre de l'année précédente", () => {
    expect(archiveTaCible(new Date("2026-01-08T09:00:00Z"))).toBe("TA_202512.zip");
  });
});

describe("urlArchiveTa", () => {
  it("construit l'URL opendata à partir du nom du zip", () => {
    expect(urlArchiveTa("TA_202609.zip")).toBe(
      "https://opendata.justice-administrative.fr/DTA/2026/09/TA_202609.zip",
    );
  });

  it("refuse un nom inattendu", () => {
    expect(() => urlArchiveTa("TA_2026.zip")).toThrow(/invalide/);
    expect(() => urlArchiveTa("CASS_20260914-210916.tar.gz")).toThrow(/invalide/);
  });
});

describe("analyserXmlTa", () => {
  it("normalise un Document de décision tel que publié", () => {
    const s = analyserXmlTa(XML_MODELE);
    expect(s).not.toBeNull();
    expect(s?.source).toBe("TA");
    expect(s?.cle).toBe("DTA_2605706_20260901.xml");
    expect(s?.juridiction).toBe("Tribunal Administratif de Nice");
    expect(s?.dateDecision).toBe("2026-09-01");
    expect(s?.reference).toBe("2605706");
    expect(s?.ecli).toBeNull();
    expect(s?.url).toBeNull();
    expect(s?.titre).toBe(
      "Tribunal Administratif de Nice — Décision — Excès de pouvoir — Rejet défaut de doute sérieux",
    );
    // Texte intégral lisible : balises retirées, entités découpées proprement.
    expect(s?.contenu).toContain("l'article R. 421-1");
    expect(s?.contenu).toContain("stationnement en double file");
    expect(s?.contenu).not.toContain("<br");
  });

  it("ignore un XML sans balise Identification", () => {
    expect(analyserXmlTa("<Document><Dossier/></Document>")).toBeNull();
  });

  it("tolère un Texte_Integral vide (contenu non publié)", () => {
    const s = analyserXmlTa(
      "<Document><Donnees_Techniques><Identification>x.xml</Identification></Donnees_Techniques></Document>",
    );
    expect(s?.contenu).toBe("");
    expect(s?.titre).toBe("Décision x.xml");
  });
});

describe("lirePublicationsTa", () => {
  it("parcourt le zip : XML analysés, fichiers hors XML ignorés", () => {
    // Mini-zip maison : répertoire + un XML valide + un texte quelconque.
    const entrees = [
      { chemin: "TA06/", brut: Buffer.alloc(0) },
      { chemin: "TA06/DTA_2605706_20260901.xml", brut: Buffer.from(XML_MODELE, "utf8") },
      { chemin: "TA06/README.txt", brut: Buffer.from("notes internes", "utf8") },
    ];
    const zip = construireZipMinimal(entrees);

    const pubs: SourceDila[] = [...lirePublicationsTa(zip)];
    expect(pubs).toHaveLength(1);
    expect(pubs[0].id).toBe("DTA_2605706_20260901.xml");
  });
});

describe("MARQUEUR_TA_RE", () => {
  it("retire le mois déjà ingéré d'un détail de trace", () => {
    expect(
      "1 archive(s), derniere=TA_202609.zip, 3 publication(s)".match(MARQUEUR_TA_RE)?.[1],
    ).toBe("TA_202609.zip");
  });

  it("ignore un échec sans token (aucune avancée du marqueur)", () => {
    expect(
      "0 archive(s), derniere=aucune, 0 publication(s) — ERREUR: index injoignable".match(
        MARQUEUR_TA_RE,
      ),
    ).toBeNull();
  });
});

/** ZIP minimal (une seule méthode deflate) pour le test de parcours. */
function construireZipMinimal(
  entrees: Array<{ chemin: string; brut: Buffer }>,
): Buffer {
  const locaux: Buffer[] = [];
  const centraux: Buffer[] = [];
  let offset = 0;
  for (const e of entrees) {
    const donnees = e.brut.length ? deflateRawSync(e.brut) : Buffer.alloc(0);
    const nom = Buffer.from(e.chemin, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(donnees.length, 18);
    local.writeUInt32LE(e.brut.length, 22);
    local.writeUInt16LE(nom.length, 26);
    locaux.push(local, nom, donnees);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(donnees.length, 20);
    central.writeUInt32LE(e.brut.length, 24);
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

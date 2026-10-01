import { describe, it, expect } from "vitest";
import {
  analyserArchive,
  analyserDecision,
  analyserTexteJorf,
  archiveAcceptable,
  decoderEntites,
  extraireTag,
  sourceDeArchive,
  texteDeXml,
  urlDecisionLelegifrance,
  type EntreeTar,
} from "@/lib/veille-dila";

/**
 * Fragments XML recopiés des publications DILA réelles (CASS / JADE / JORF).
 * Ils reproduisent la structure observée, balises et imbrications comprises.
 */
const CASS = `<?xml version="1.0" encoding="UTF-8"?>
<TEXTE_JURI_JUDI>
<META>
<META_COMMUN>
<ID>JURITEXT000053345451</ID>
<ORIGINE>JURI</ORIGINE>
<NATURE>ARRET</NATURE>
</META_COMMUN>
<META_SPEC>
<META_JURI>
<TITRE>Cour de cassation, civile, Chambre civile 1, 7 janvier 2026, 24-18.856, Publié au bulletin</TITRE>
<DATE_DEC>2026-01-07</DATE_DEC>
<JURIDICTION>Cour de cassation</JURIDICTION>
<NUMERO>12600011</NUMERO>
<SOLUTION>Cassation partielle</SOLUTION>
</META_JURI>
<META_JURI_JUDI>
<NUMEROS_AFFAIRES>
<NUMERO_AFFAIRE>24-18856</NUMERO_AFFAIRE>
</NUMEROS_AFFAIRES>
<FORMATION>CHAMBRE_CIVILE_1</FORMATION>
<ECLI>ECLI:FR:CCASS:2026:C100011</ECLI>
</META_JURI_JUDI>
</META_SPEC>
</META>
<TEXTE>
<BLOC_TEXTUEL>
<CONTENU>LA COUR DE CASSATION, PREMIERE CHAMBRE CIVILE, a rendu l'arrêt suivant : <br/>
<br/> Vu l'article 3 de la loi n° 2002-1138 du 17 août 2002 ; <br/>
L'appelant conteste la légalité de l'amende forfaitaire. <br/>
</CONTENU>
</BLOC_TEXTUEL>
</TEXTE>
</TEXTE_JURI_JUDI>`;

const JADE = `<?xml version="1.0" encoding="UTF-8"?>
<TEXTE_JURI_ADMIN>
<META>
<META_COMMUN>
<ID>CETATEXT000054841719</ID>
<ORIGINE>CETAT</ORIGINE>
<NATURE>Texte</NATURE>
</META_COMMUN>
<META_SPEC>
<META_JURI>
<TITRE>Conseil d'État, Juge des référés, 14/09/2026, 519188, Inédit au recueil Lebon</TITRE>
<DATE_DEC>2026-09-14</DATE_DEC>
<JURIDICTION>Conseil d'État</JURIDICTION>
<NUMERO>519188</NUMERO>
<SOLUTION/>
</META_JURI>
<META_JURI_ADMIN>
<FORMATION>Juge des référés</FORMATION>
<TYPE_REC>Excès de pouvoir</TYPE_REC>
<ECLI>ECLI:FR:CEORD:2026:519188.20260914</ECLI>
</META_JURI_ADMIN>
</META_SPEC>
</META>
<TEXTE>
<BLOC_TEXTUEL>
<CONTENU>
<p>Vu la procédure suivante :<br/>
Par une requêteRecorded, la société demande la suspension de la décision contestée.</p>
</CONTENU>
</BLOC_TEXTUEL>
</TEXTE>
</TEXTE_JURI_ADMIN>`;

const JORF = `<?xml version="1.0" encoding="UTF-8"?>
<TEXTE_VERSION>
<META>
<META_COMMUN>
<ID>JORFTEXT000054912927</ID>
<ID_ELI>https://www.legifrance.gouv.fr/eli/arrete/2026/9/9/MENE2622067A/jo/texte</ID_ELI>
<NATURE>ARRETE</NATURE>
</META_COMMUN>
<META_SPEC>
<META_TEXTE_CHRONICLE>
<NOR>MENE2622067A</NOR>
<DATE_PUBLI>2026-09-30</DATE_PUBLI>
<DATE_TEXTE>2026-09-09</DATE_TEXTE>
</META_TEXTE_CHRONICLE>
<META_TEXTE_VERSION>
<TITRE>Arrêté du 9 septembre 2026</TITRE>
<TITREFULL>Arrêté du 9 septembre 2026 relatif aux modèles de diplôme du baccalauréat général</TITREFULL>
<MINISTERE>Ministère de l'éducation nationale</MINISTERE>
</META_TEXTE_VERSION>
</META_SPEC>
</META>
<TEXTE>
<BLOC_TEXTUEL>
<CONTENU>Article 1 : les présents modèles sont applicables.</CONTENU>
</BLOC_TEXTUEL>
</TEXTE>
</TEXTE_VERSION>`;

function entree(chemin: string, xml: string): EntreeTar {
  return { chemin, contenu: Buffer.from(xml, "utf8") };
}

describe("veille-dila — utilitaires XML", () => {
  it("décode les entités usuelles", () => {
    expect(decoderEntites("a &amp; b &lt;c&gt; &quot;d&quot; &#233;")).toBe(
      'a & b <c> "d" é',
    );
  });

  it("extrait le contenu d'une balise", () => {
    expect(extraireTag(CASS, "NATURE")).toBe("ARRET");
  });

  it("renvoie une chaîne vide pour une balise auto-fermante", () => {
    expect(extraireTag("<SOLUTION/>", "SOLUTION")).toBe("");
  });

  it("renvoie null si la balise est absente", () => {
    expect(extraireTag(CASS, "BALISE_INEXISTANTE")).toBeNull();
  });

  it("ne confond pas NUMERO et NUMERO_AFFAIRE", () => {
    expect(extraireTag(CASS, "NUMERO")).toBe("12600011");
    expect(extraireTag(CASS, "NUMERO_AFFAIRE")).toBe("24-18856");
  });

  it("transforme le XML en texte lisible (balises, sauts, entités)", () => {
    const texte = texteDeXml(
      "<CONTENU>a<br/>b</CONTENU><p>Paragraphe</p> &amp; suite",
    );
    expect(texte).toContain("a\nb");
    expect(texte).toContain("Paragraphe");
    expect(texte).toContain("& suite");
  });
});

describe("veille-dila — décision CASS", () => {
  const d = analyserDecision(CASS, "CASS")!;

  it("est correctement identifiée", () => {
    expect(d).not.toBeNull();
    expect(d.id).toBe("JURITEXT000053345451");
    expect(d.source).toBe("CASS");
    expect(d.nature).toBe("ARRET");
  });

  it("utilise l'ECLI comme clé de dédup", () => {
    expect(d.cle).toBe("ECLI:FR:CCASS:2026:C100011");
    expect(d.ecli).toBe("ECLI:FR:CCASS:2026:C100011");
  });

  it("retient le numéro d'affaire (pas le numéro interne)", () => {
    expect(d.reference).toBe("24-18856");
  });

  it("extrait juridiction et date au format ISO", () => {
    expect(d.juridiction).toBe("Cour de cassation");
    expect(d.dateDecision).toBe("2026-01-07");
  });

  it("construit l'URL Légifrance à partir de l'identifiant DILA", () => {
    expect(d.url).toBe(
      "https://www.legifrance.gouv.fr/juri/id/JURITEXT000053345451",
    );
    expect(urlDecisionLelegifrance("X")).toContain("/juri/id/X");
  });

  it("nettoie le contenu (plus de balise)", () => {
    expect(d.contenu).toContain("a rendu l'arrêt suivant");
    expect(d.contenu).not.toContain("<br/>");
  });
});

describe("veille-dila — décision JADE", () => {
  const d = analyserDecision(JADE, "JADE")!;

  it("est correctement identifiée", () => {
    expect(d.id).toBe("CETATEXT000054841719");
    expect(d.source).toBe("JADE");
    expect(d.juridiction).toBe("Conseil d'État");
    expect(d.dateDecision).toBe("2026-09-14");
  });

  it("retombe sur NUMERO quand NUMERO_AFFAIRE est absent", () => {
    expect(d.reference).toBe("519188");
  });

  it("retient l'ECLI et l'URL Légifrance", () => {
    expect(d.cle).toBe("ECLI:FR:CEORD:2026:519188.20260914");
    expect(d.url).toBe(
      "https://www.legifrance.gouv.fr/juri/id/CETATEXT000054841719",
    );
  });
});

describe("veille-dila — texte JORF", () => {
  const t = analyserTexteJorf(JORF)!;

  it("est correctement identifié", () => {
    expect(t.id).toBe("JORFTEXT000054912927");
    expect(t.source).toBe("JORF");
    expect(t.nature).toBe("ARRETE");
  });

  it("privilégie le titre complet", () => {
    expect(t.titre).toContain("modèles de diplôme");
  });

  it("conserve l'URL ELI Légifrance", () => {
    expect(t.url).toBe(
      "https://www.legifrance.gouv.fr/eli/arrete/2026/9/9/MENE2622067A/jo/texte",
    );
  });

  it("utilise la date du texte (pas celle de publication)", () => {
    expect(t.dateDecision).toBe("2026-09-09");
  });

  it("retient le NOR comme référence", () => {
    expect(t.reference).toBe("MENE2622067A");
  });
});

describe("veille-dila — archive", () => {
  it("aiguille chaque XML vers le bon analyseur", () => {
    const resultats = analyserArchive("JADE", [
      entree("a/JURITEXT1.xml", CASS),
      entree("a/CETATEXT1.xml", JADE),
      entree("a/JORFTEXT1.xml", JORF),
    ]);
    expect(resultats.map((r) => r.source).sort()).toEqual(["CASS", "JADE", "JORF"]);
  });

  it("ignore les fichiers non-XML", () => {
    const resultats = analyserArchive("JORF", [
      { chemin: "lisezmoi.txt", contenu: Buffer.from("rien") },
    ]);
    expect(resultats).toEqual([]);
  });

  it("ignore les ARTICLE (redondants avec le texte complet)", () => {
    const article = `<?xml version="1.0"?><ARTICLE><META><META_COMMUN><ID>JORFARTI1</ID></META_COMMUN></META><CONTENU>Article 1</CONTENU></ARTICLE>`;
    expect(analyserArchive("JORF", [entree("a/JORFARTI1.xml", article)])).toEqual(
      [],
    );
  });

  it("saute un XML corrompu sans interrompre les autres", () => {
    const resultats = analyserArchive("CASS", [
      entree("a/casse.xml", "<TEXTE_JURI_JUDI><ID"),
      entree("a/bonne.xml", CASS),
    ]);
    expect(resultats).toHaveLength(1);
    expect(resultats[0].id).toBe("JURITEXT000053345451");
  });

  it("déduit la source du nom d'archive", () => {
    expect(sourceDeArchive("CASS_20260914-210916.tar.gz")).toBe("CASS");
    expect(sourceDeArchive("JADE_20260929-213457.tar.gz")).toBe("JADE");
    expect(sourceDeArchive("JORF_20260930-011706.tar.gz")).toBe("JORF");
    expect(sourceDeArchive("inconnu.tar.gz")).toBeNull();
  });

  it("refuse une archive vide ou trop grosse", () => {
    expect(archiveAcceptable(0)).toBe(false);
    expect(archiveAcceptable(Number.POSITIVE_INFINITY)).toBe(false);
    expect(archiveAcceptable(64 * 1024 * 1024 + 1)).toBe(false);
    expect(archiveAcceptable(1024)).toBe(true);
  });
});

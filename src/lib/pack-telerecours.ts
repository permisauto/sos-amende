import { formaterDateFr } from "@/lib/envoi";
import { generateLettrePdf } from "@/lib/lettre-pdf";
import { remplirTemplate, type ExtractedData } from "@/lib/moteur";
import { storageWrite } from "@/lib/storage";

/**
 * Pack Télérecours Citoyens (documents classés 3F / 48SI) : les 3 PDF que le
 * client télécharge pour déposer sa contestation sur le portail officiel —
 * requête au fond (la lettre validée + signée), requête en référé-suspension
 * (art. L. 521-2 CJA, template de la faille principale, jamais de texte hors
 * base) et bordereau des pièces (inventaire procédural uniquement).
 * Stockés dans `Courrier.packUrls` (JSON).
 */
export type PackTelecours = {
  requete?: string;
  refere?: string;
  bordereau?: string;
};

/** Le pack n'est rendu que pour un dossier SUSPENSION déposé en ligne via
 * Télérecours dont le document a été classé 3F ou 48SI à l'OCR. */
export function estPackTelecours(opts: {
  type: string;
  canal: string | null | undefined;
  docType: unknown;
}): boolean {
  return (
    opts.type === "SUSPENSION" &&
    opts.canal === "TELERECOURS" &&
    (opts.docType === "3F" || opts.docType === "48SI")
  );
}

/**
 * Texte du bordereau : en-tête du dépôt + liste numérotée des documents
 * réellement produits. Inventaire procédural — aucun contenu juridique.
 */
export function texteBordereau(opts: {
  numRef?: string | null;
  dateDecision?: string | null;
  documents: string[];
}): string {
  // L'en-tête et la phrase finale ne parlent de référé que si le référé fait
  // réellement partie des documents listés (aucun document fantôme).
  const aRefere = opts.documents.some((d) => d.toLowerCase().includes("référé"));
  const lignes: string[] = ["BORDEREAU DES PIÈCES DU DÉPÔT"];
  if (aRefere) {
    lignes.push(
      "Tribunal administratif — formation de référé (article L. 521-2 du code de justice administrative)",
    );
  }
  lignes.push("");
  if (opts.numRef) lignes.push(`Dossier n° ${opts.numRef}`);
  const dateFr = formaterDateFr(opts.dateDecision);
  if (dateFr) lignes.push(`Décision contestée en date du ${dateFr}`);
  lignes.push("");
  opts.documents.forEach((doc, i) => lignes.push(`${i + 1}. ${doc}`));
  lignes.push(
    "",
    aRefere
      ? "Les documents ci-dessus sont déposés ensemble : requête au fond, requête en référé-suspension et pièces."
      : "Les documents ci-dessus sont déposés ensemble avec la requête au fond.",
  );
  return lignes.join("\n");
}

/**
 * Génère les PDF du pack et stocke chacun via `storageWrite`. Échec d'un PDF
 * = exception propagée (l'appelant est best-effort : jamais de validation
 * bloquée par le pack). Le référé n'est produit que si la faille principale
 * porte un `templateRefere` validé — sinon le pack se limite à la requête et
 * au bordereau (anti-hallucination).
 */
export async function genererPackTelecours(opts: {
  dossierId: string;
  /** Lettre déjà habillée (formaterLettreOfficielle) — devient la requête. */
  lettreFinale: string;
  data: ExtractedData; // variables {nom}/{num_pv}/{date} + urgence du référé
  templateRefere: string | null;
  piecesJointes: string[];
  signatureDataUrl: string | null;
  numRef: string | null;
  dateDecision: string | null;
}): Promise<PackTelecours> {
  const documents: string[] = [
    `Requête au fond (lettre de contestation)${opts.signatureDataUrl ? " — signée" : ""}`,
  ];
  let refereTexte: string | null = null;
  if (opts.templateRefere) {
    documents.push(
      "Requête en référé-suspension (article L. 521-2 du code de justice administrative)",
    );
    // remplirTemplate applique nettoyerLettre : les variables d'urgence non
    // saisies ({metier}/{entreprise}/{risque_licenciement}) disparaissent.
    refereTexte = remplirTemplate(opts.templateRefere, opts.data);
  }
  documents.push(...opts.piecesJointes);

  const bordereau = texteBordereau({
    numRef: opts.numRef,
    dateDecision: opts.dateDecision,
    documents,
  });

  // Noms de fichiers normalisés (conventions Télérecours) : le nom du fichier
  // téléchargé côté client/juriste est le basename du href — jamais un nom
  // horodaté. La clé reste isolée par dossier (`pdfs/pack/<id>/…`) : une
  // régénération écrase proprement le fichier au lieu d'en accumuler.
  const base = `pdfs/pack/${opts.dossierId}/`;
  const urls: PackTelecours = {
    requete: await storageWrite(
      `${base}Requete_au_fond_REP.pdf`,
      await generateLettrePdf(
        opts.lettreFinale,
        opts.signatureDataUrl,
        opts.piecesJointes,
      ),
    ),
    bordereau: await storageWrite(
      `${base}Bordereau_Recapitulatif_des_Pieces.pdf`,
      await generateLettrePdf(bordereau, opts.signatureDataUrl, null),
    ),
  };
  if (refereTexte) {
    urls.refere = await storageWrite(
      `${base}Requete_Refere_Suspension.pdf`,
      await generateLettrePdf(refereTexte, opts.signatureDataUrl, null),
    );
  }
  return urls;
}

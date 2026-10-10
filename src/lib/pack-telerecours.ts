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
 * Référé de secours (chantier 3, 2026-10-10) : utilisé quand le dossier porte
 * l'urgence professionnelle (`extractedData.urgencePro`) mais que la faille
 * principale n'a pas de `templateRefere` en base. Ne cite que l'article
 * L. 521-2 du CJA (déjà présent au catalogue) — jamais d'article inventé.
 * Les variables d'urgence non saisies ({metier}/{entreprise}/{siret}/
 * {risque_licenciement}) sont effacées par `nettoyerLettre`.
 */
const REFERE_SECOURS_URGENCE = `À Monsieur le Président du tribunal administratif siégeant en formation de référé,

Je soussigné(e) {nom}, ai l'honneur de saisir Monsieur le Président, par la présente requête en référé, d'une demande de suspension d'exécution de la décision n° {num_pv} en date du {date} portant atteinte à la validité de mon permis de conduire.

SUR LE FONDEMENT DE L'ARTICLE L. 521-2 DU CODE DE JUSTICE ADMINISTRATIVE

L'urgence est caractérisée par les conséquences immédiates de la décision contestée sur ma vie professionnelle : l'interdiction de conduire met en péril la poursuite de mon activité. J'exerce l'activité de {metier} au sein de {entreprise} (SIRET {siret}), et {risque_licenciement}.

Le moyen présenté à l'appui de la présente demande est la légalité manifeste de la décision contestée, tel qu'exposé dans la requête au fond déposée simultanément au greffe de la juridiction — illégalité dont il est sérieusement douté qu'elle puisse être écartée au principal.

EN CONSÉQUENCE

Je demande qu'il plaise à Monsieur le Président du tribunal administratif, en application de l'article L. 521-2 du code de justice administrative, d'ordonner la suspension de l'exécution de la décision n° {num_pv} en date du {date}, l'administration disposant du délai légal pour régulariser la situation si elle le juge opportun.`;

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
 * bloquée par le pack). Le référé est produit si la faille principale porte
 * un `templateRefere` validé **ou** si le client a coché l'urgence
 * professionnelle (`data.urgencePro`) — auquel cas le référé de secours L.
 * 521-2 est utilisé à défaut de template en base (anti-hallucination : seul
 * l'article déjà présent au catalogue est cité). Sinon le pack se limite à
 * la requête et au bordereau.
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
  const urgencePro = opts.data.urgencePro === true;
  // `||` (pas `??`) : une éventuelle chaîne vide en base doit basculer sur le
  // secours au lieu de produire un référé vide.
  const templateRefere =
    opts.templateRefere || (urgencePro ? REFERE_SECOURS_URGENCE : null);
  if (templateRefere) {
    documents.push(
      "Requête en référé-suspension (article L. 521-2 du code de justice administrative)",
    );
    // remplirTemplate applique nettoyerLettre : les variables d'urgence non
    // saisies ({metier}/{entreprise}/{risque_licenciement}) disparaissent.
    refereTexte = remplirTemplate(templateRefere, opts.data);
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

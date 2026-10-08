"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireJuristeRedacteur } from "@/lib/dal";
import {
  FAILLE_IDS,
  detecterFailles,
  remplirLettreMulti,
  type ExtractedData,
  type RegleDetection,
} from "@/lib/moteur";
import { notifierStatut } from "@/lib/notifications";
import { activerDepotEnLigne, peutActiverDepotEnLigne } from "@/lib/lien-depot";
import { storageRead, storageWrite } from "@/lib/storage";
import { generateLettrePdf } from "@/lib/lettre-pdf";
import { soumettreDossier } from "@/lib/antai";
import { generatePreuvePdf } from "@/lib/preuve-pdf";
import { destinataireLrar, canauxEnvoi, formaterLettreOfficielle, organismeEnvoi, lireDocType, type CanalEnvoi } from "@/lib/envoi";
import { setDemoLettre } from "@/lib/demo-lettres";
import { listePiecesJointes, recupererPreuvesPourDossierId } from "@/lib/preuves-api";
import {
  faitsDepuisPreuves,
  fusionnerCandidats,
  memesIds,
  type MajSuggestion,
} from "@/lib/verif-failles";
import { verifierAvecIa } from "@/lib/verif-ia";
import { contexteEtalonnage } from "@/lib/etalonnage";
import { controlerForclusion48si } from "@/lib/delais";
import {
  estPackTelecours,
  genererPackTelecours,
  type PackTelecours,
} from "@/lib/pack-telerecours";

export type ValidationState = { error?: string; ok?: boolean } | undefined;

const DECISION_OMP = ["ACCEPTE", "REJETE"] as const;

const DEMO_IDS = new Set([
  "pv-analyse-001",
  "pv-sign-002",
  "pv-pret-003",
  "pv-envoye-004",
  "pv-rejete-005",
  "pv-resolu-006",
  "dec-analyse-007",
  "dec-sign-008",
  "dec-pret-009",
]);

function isDemoId(id: string): boolean {
  return DEMO_IDS.has(id) || id.startsWith("pv-") || id.startsWith("dec-");
}

/**
 * Soumission de la contestation (lettre + pièces jointes) vers le portail
 * ANTAI / Télérecours dès la validation du juriste. En cas de succès le
 * dossier passe en ENVOYE avec accusé de dépôt ; en cas d'échec il reste
 * PRET/validé — le juriste peut relancer ou basculer sur le canal lettre
 * recommandée (envoyée par SOS Amende).
 */
export async function soumettreEtMarquerEnvoye(dossierId: string) {
  await requireJuristeRedacteur();
  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    include: {
      preuves: { orderBy: { createdAt: "asc" } },
      courriers: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!dossier) return { ok: false as const, error: "Dossier introuvable." };
  // Garde de statut : seul un dossier PRET (signé, validé) peut être envoyé.
  // Évite un double envoi (course de relance, envoi LRAR par nos soins…).
  if (dossier.statut !== "PRET") {
    return {
      ok: false as const,
      error: "Ce dossier n'est plus en attente d'envoi (déjà transmis ?).",
    };
  }
  // Garde-fou canal : un dossier au canal lettre recommandée ne doit jamais
  // partir en soumission en ligne — l'envoi LRAR est effectué par SOS Amende
  // (`envoyerParLrar`), pas par ce portail.
  if (dossier.canalEnvoi === "LRAR") {
    return {
      ok: false as const,
      error:
        "Canal lettre recommandée retenu : la contestation est envoyée par SOS Amende (LRAR), pas en ligne.",
    };
  }

  // Verrou atomique : la transition PRET → ENVOYE se fait AVANT l'appel
  // externe pour empêcher deux soumissions concurrentes (deux clics, relance
  // simultanée du client et du juriste). Si la soumission échoue, on revient
  // en PRET (lettre validée, relançable).
  const verrou = await prisma.dossier.updateMany({
    where: { id: dossier.id, statut: "PRET" },
    data: { statut: "ENVOYE", decisionAttendueLe: new Date() },
  });
  if (verrou.count === 0) {
    return { ok: false as const, error: "Dossier déjà envoyé." };
  }

  const organisme = organismeEnvoi(dossier.type);
  const dataExt = (dossier.extractedData ?? {}) as Record<string, unknown>;
  const piecesJointes = listePiecesJointes({
    type: dossier.type,
    conditionsMeteo: dossier.conditions_meteo,
    numRef: typeof dataExt["num_pv"] === "string" ? (dataExt["num_pv"] as string) : null,
    preuves: dossier.preuves.map((p) => ({ nom: p.nom, type: p.type, url: p.url })),
  });
  const result = await soumettreDossier(
    dossier,
    piecesJointes.map((nom) => ({ nom })),
  );
  if (!result.ok) {
    // Rollback : retour en PRET (lettre validée) — le juriste relance ou
    // bascule sur le canal lettre recommandée (SOS Amende) via
    // `envoyerContestation`.
    await prisma.dossier.update({
      where: { id: dossier.id },
      data: { statut: "PRET" },
    });
    return result;
  }

  const courrier = dossier.courriers[dossier.courriers.length - 1];
  await prisma.$transaction([
    // Suivi des décisions : n° de dépôt portail + début de la fenêtre d'attente.
    prisma.dossier.update({
      where: { id: dossier.id },
      data: { numeroDepot: result.numeroDepot, decisionAttendueLe: new Date() },
    }),
    ...(courrier
      ? [
          prisma.courrier.update({
            where: { id: courrier.id },
            data: { preuveDepotUrl: result.preuveUrl },
          }),
        ]
      : []),
    prisma.dossierEvent.create({
      data: {
        dossierId: dossier.id,
        type: "ENVOI",
        detail: `Envoyé à ${organisme} (n° dépôt ${result.numeroDepot}).`,
      },
    }),
  ]);

  // Notification (défensive : sans AUTH_RESEND_KEY, aucun e-mail envoyé).
  await notifierStatut(dossier.id).catch(() => false);

  return { ok: true as const, numeroDepot: result.numeroDepot };
}

export async function enregistrerDecisionOmp(
  _prev: ValidationState,
  formData: FormData,
): Promise<ValidationState> {
  await requireJuristeRedacteur();

  const dossierId = String(formData.get("dossierId") ?? "");
  const raw = String(formData.get("decisionOmp") ?? "");
  const decisionOmp = DECISION_OMP.find((d) => d === raw);
  if (!decisionOmp) {
    return { error: "Décision OMP invalide." };
  }
  const decisionDetail = String(formData.get("decisionDetail") ?? "").trim();

  const dossier = await prisma.dossier.findUnique({ where: { id: dossierId } });
  if (!dossier) {
    if (isDemoId(dossierId)) {
      revalidatePath("/dashboard/juriste");
      revalidatePath(`/dashboard/juriste/${dossierId}`);
      redirect(`/dashboard/juriste/${dossierId}?decision=ok`);
    }
    return { error: "Dossier introuvable." };
  }
  if (dossier.statut !== "ENVOYE") {
    return { error: "La décision OMP ne s'applique qu'aux dossiers envoyés." };
  }

  await prisma.$transaction([
    prisma.dossier.update({
      where: { id: dossier.id },
      data: {
        statut: "RESOLU",
        decisionOmp,
        decisionDetail: decisionDetail || null,
      },
    }),
    prisma.dossierEvent.create({
      data: {
        dossierId: dossier.id,
        type: "DECISION",
        detail: decisionDetail || decisionOmp,
      },
    }),
  ]);

  // Notification (défensive : sans AUTH_RESEND_KEY, aucun e-mail envoyé).
  await notifierStatut(dossier.id).catch(() => false);

  revalidatePath("/dashboard/juriste");
  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/admin/dossiers");
  redirect(`/dashboard/juriste/${dossier.id}?decision=ok`);
}

export async function validerDossier(
  _prev: ValidationState,
  formData: FormData,
): Promise<ValidationState> {
  await requireJuristeRedacteur();

  const dossierId = String(formData.get("dossierId") ?? "");
  const canalSaisi = String(formData.get("canalEnvoi") ?? "");
  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    include: {
      courriers: { orderBy: { createdAt: "asc" } },
      user: { select: { name: true, signatureUrl: true } },
      preuves: { orderBy: { createdAt: "asc" } },
      failleJuridique: { select: { templateRefere: true } },
    },
  });
  if (!dossier) {
    if (isDemoId(dossierId)) {
      revalidatePath("/dashboard/juriste");
      revalidatePath(`/dashboard/juriste/${dossierId}`);
      redirect(`/dashboard/juriste/${dossierId}?valide=ok`);
    }
    return { error: "Dossier introuvable." };
  }
  // Statuts éligibles : EN_ATTENTE_VALIDATION (nouveau flux) et legs
  // PRET/A_VERIFIER (dossiers démarrés avant la refonte, démos).
  if (
    dossier.statut !== "EN_ATTENTE_VALIDATION" &&
    dossier.statut !== "PRET" &&
    dossier.statut !== "A_VERIFIER"
  ) {
    return { error: "Seul un dossier en attente de validation peut être approuvé." };
  }
  if (!dossier.lettreGeneree) {
    return { error: "Aucune lettre générée à valider." };
  }

  // Forclusion 48SI (60 jours francs de la notification) : bloquant côté
  // juriste — jamais fabriqué si la date de notification est absente.
  if (dossier.type === "SUSPENSION") {
    const ed = (dossier.extractedData ?? {}) as Record<string, unknown>;
    if (ed.docType === "48SI") {
      const forclusion = controlerForclusion48si(
        typeof ed.dateNotification === "string" ? ed.dateNotification : null,
      );
      if (forclusion?.depasse) {
        return {
          error: `Forclusion dépassée — le recours 48SI devait être engagé avant le ${forclusion.dateForclusion.toLocaleDateString("fr-FR")} (${forclusion.joursDepasse} jour${forclusion.joursDepasse > 1 ? "s" : ""} de dépassement). Validation refusée : vérifiez le délai avec le client.`,
        };
      }
    }
  }

  // Canal d'envoi choisi par le juriste, restreint au type d'infraction
  // (AMENDE : ANTAI/LRAR, SUSPENSION : Télérecours/LRAR).
  const canaux = canauxEnvoi(dossier.type);
  let canal: CanalEnvoi = canaux[0];
  if (canalSaisi) {
    const valide = canaux.some((c) => c === canalSaisi);
    if (!valide) {
      return {
        error:
          "Canal d'envoi invalide pour ce type de dossier (amende : ANTAI ou lettre recommandée ; suspension : Télérecours ou lettre recommandée).",
      };
    }
    canal = canalSaisi as CanalEnvoi;
  }

  const dataExt = (dossier.extractedData ?? {}) as Record<string, unknown>;
  const piecesJointes = listePiecesJointes({
    type: dossier.type,
    conditionsMeteo: dossier.conditions_meteo,
    numRef: typeof dataExt["num_pv"] === "string" ? (dataExt["num_pv"] as string) : null,
    preuves: dossier.preuves.map((p) => ({ nom: p.nom, type: p.type, url: p.url })),
  });

  // Habillage professionnel (en-tête, Objet, Madame, Monsieur, politesse)
  // appliqué aussi aux anciennes lettres. La liste des pièces jointes figure
  // une seule fois, sous la signature, dans le PDF signé.
  const lettreFinale = formaterLettreOfficielle({
    type: dossier.type,
    corps: dossier.lettreGeneree,
    docType: lireDocType(dataExt["docType"]),
    numRef: typeof dataExt["num_pv"] === "string" ? (dataExt["num_pv"] as string) : null,
    dateRef: typeof dataExt["date"] === "string" ? (dataExt["date"] as string) : null,
    nom: dossier.user?.name ?? null,
    date: new Date().toISOString().slice(0, 10),
  });

  const courrier = dossier.courriers[dossier.courriers.length - 1];
  const dejaSigne = !!courrier?.pdfUrl;
  const signatureProfil = dossier.user?.signatureUrl ?? null;

  // Cas A : la signature capturée au dépôt (User.signatureUrl) permet de
  // produire directement la lettre signée — le dossier est PRET à la
  // validation et le lien de dépôt assisté est émis aussitôt (canal en ligne),
  // sans repasser par la signature du client.
  let pdfSigne: { pdfUrl: string; signatureUrl: string } | null = null;
  let signatureDataUrl: string | null = null;
  if (!dejaSigne && signatureProfil) {
    const sig = await storageRead(signatureProfil);
    if (sig) {
      signatureDataUrl = `data:image/png;base64,${sig.toString("base64")}`;
      try {
        const pdfBuffer = await generateLettrePdf(
          lettreFinale,
          signatureDataUrl,
          piecesJointes,
        );
        const pdfUrl = await storageWrite(
          `pdfs/lettre-${dossier.id}-${Date.now()}.pdf`,
          pdfBuffer,
        );
        pdfSigne = { pdfUrl, signatureUrl: signatureProfil };
      } catch (e) {
        // Signature illisible : repli sur le cas B sans bloquer le juriste.
        console.error("validerDossier: génération PDF pré-signé échouée", e);
      }
    }
  } else if (dejaSigne && courrier?.signatureUrl) {
    // Dossier déjà signé (legs / Cas A) : la signature du courrier sert au
    // pack Télérecours (requête et référé portent la signature du requérant).
    const sig = await storageRead(courrier.signatureUrl);
    if (sig) {
      signatureDataUrl = `data:image/png;base64,${sig.toString("base64")}`;
    }
  }

  const estSigne = dejaSigne || !!pdfSigne;

  // Pack Télérecours (3F/48SI) : requête, référé (art. L. 521-2) et bordereau.
  // Générés seulement une fois la lettre signée — best-effort : un échec n'a
  // jamais bloqué une validation (le juriste relancera en relisant la lettre).
  let packUrls: PackTelecours | null = null;
  if (
    estSigne &&
    estPackTelecours({ type: dossier.type, canal, docType: dataExt["docType"] })
  ) {
    try {
      packUrls = await genererPackTelecours({
        dossierId: dossier.id,
        lettreFinale,
        data: dataExt as unknown as ExtractedData,
        templateRefere: dossier.failleJuridique?.templateRefere ?? null,
        piecesJointes,
        signatureDataUrl,
        numRef: typeof dataExt["num_pv"] === "string" ? dataExt["num_pv"] : null,
        dateDecision: typeof dataExt["date"] === "string" ? dataExt["date"] : null,
      });
    } catch (e) {
      console.error("validerDossier: pack Télérecours non généré", e);
    }
  }

  await prisma.$transaction([
    prisma.dossier.update({
      where: { id: dossier.id },
      data: {
        statut: estSigne ? "PRET" : "EN_ATTENTE_PRE_SIGNATURE",
        valideLe: new Date(),
        canalEnvoi: canal,
        lettreGeneree: lettreFinale,
      },
    }),
    ...(pdfSigne
      ? [
          prisma.courrier.create({
            data: {
              dossierId: dossier.id,
              signatureUrl: pdfSigne.signatureUrl,
              pdfUrl: pdfSigne.pdfUrl,
              ...(packUrls ? { packUrls } : {}),
            },
          }),
        ]
      : []),
    // Pack sans nouveau courrier (déjà signé) : rattaché au courrier existant,
    // ou premier courrier du dossier s'il n'y en a aucun (legs non signé).
    ...(packUrls && !pdfSigne
      ? courrier
        ? [
            prisma.courrier.update({
              where: { id: courrier.id },
              data: { packUrls },
            }),
          ]
        : [
            prisma.courrier.create({
              data: { dossierId: dossier.id, packUrls },
            }),
          ]
      : []),
    prisma.dossierEvent.create({
      data: { dossierId: dossier.id, type: "VALIDATION" },
    }),
  ]);

  // Canal en ligne (ANTAI/Télérecours) : le client dépose lui-même sa
  // contestation sur le portail officiel via le lien de dépôt assisté
  // (Option 2, zéro iframe). Plus aucun envoi automatique au portail : le
  // dossier passe ENVOYE à la confirmation du dépôt par le client (page
  // /recours/finaliser ou bouton « J'ai déposé » de son espace client). Le
  // lien est émis dès que la lettre est prête à déposer :
  // — Cas A (déjà signé → PRET) : émis ici, à la validation ;
  // — Cas B (à signer → EN_ATTENTE_PRE_SIGNATURE) : émis dans `signerDossier`
  //   dès la signature du client (pas de lien avant que le dossier soit PRET).
  if (peutActiverDepotEnLigne(canal) && estSigne) {
    await activerDepotEnLigne({ dossierId: dossier.id, canal }).catch((e) => {
      console.error("validerDossier: échec création du lien de dépôt", e);
      return null;
    });
  }

  // Notification (défensive : sans AUTH_RESEND_KEY, aucun e-mail envoyé).
  await notifierStatut(dossier.id).catch(() => false);

  revalidatePath("/dashboard/juriste");
  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/admin/dossiers");

  // Cas B : la lettre validée attend la signature du client (le lien de dépôt
  // sera émis à sa signature).
  if (!estSigne) {
    redirect(`/dashboard/juriste/${dossier.id}?valide=ok`);
  }

  // Canal LRAR : SOS Amende envoie la lettre par nos soins ; le juriste
  // déclenche le dépôt via `envoyerContestation`.
  if (canal === "LRAR") {
    redirect(`/dashboard/juriste/${dossier.id}?valide=ok`);
  }

  // Cas A en ligne : le lien de dépôt assisté vient d'être envoyé au client —
  // il dépose sa contestation sur le portail officiel puis marque le dossier.
  redirect(`/dashboard/juriste/${dossier.id}?valide=ok&lien=envoye`);
}

/**
 * Relance / déclenchement de l'envoi par le juriste quand la validation a été
 * enregistrée (dossier PRET + validé, jamais ENVOYE). Pour le canal LRAR,
 * l'envoi est fait par nos soins (SOS Amende expédie la lettre recommandée) :
 * le juriste enregistre le dépôt et le numéro de recommandé. Pour un canal en
 * ligne (ANTAI / Télérecours), le lien de dépôt assisté est (ré)envoyé au
 * client — pas de soumission automatique.
 */
export async function envoyerContestation(
  _prev: ValidationState,
  formData: FormData,
): Promise<ValidationState> {
  await requireJuristeRedacteur();

  const dossierId = String(formData.get("dossierId") ?? "");
  const canalSaisi = String(formData.get("canalEnvoi") ?? "");
  const numeroRecommandé = String(formData.get("numeroRecommandé") ?? "").trim();
  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    include: {
      preuves: { orderBy: { createdAt: "asc" } },
      courriers: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!dossier) {
    if (isDemoId(dossierId)) {
      revalidatePath("/dashboard/juriste");
      revalidatePath(`/dashboard/juriste/${dossierId}`);
      redirect(`/dashboard/juriste/${dossierId}?envoye=ok`);
    }
    return { error: "Dossier introuvable." };
  }
  if (dossier.statut !== "PRET" || !dossier.valideLe) {
    return {
      error: "La contestation doit être validée et pas encore envoyée.",
    };
  }

  // Canal d'envoi : par défaut celui retenu à la validation ; le juriste peut
  // basculer au moment de l'envoi (ANTAI↔LRAR / Télérecours↔LRAR).
  let canal: CanalEnvoi =
    (dossier.canalEnvoi as CanalEnvoi | null) ?? canauxEnvoi(dossier.type)[0];
  if (canalSaisi) {
    const valide = canauxEnvoi(dossier.type).some((c) => c === canalSaisi);
    if (!valide) {
      return {
        error:
          "Canal d'envoi invalide pour ce type de dossier (amende : ANTAI ou lettre recommandée ; suspension : Télérecours ou lettre recommandée).",
      };
    }
    canal = canalSaisi as CanalEnvoi;
  }

  // Canal LRAR : l'envoi est effectué par SOS Amende (par nos soins). Le
  // juriste enregistre le dépôt de la lettre recommandée avec accusé de
  // réception — l'accusé de dépôt est généré sur-le-champ.
  if (canal === "LRAR") {
    await prisma.dossier.update({
      where: { id: dossier.id },
      data: { canalEnvoi: canal },
    });
    const envoi = await envoyerParLrar(dossier.id, { numeroRecommandé });
    revalidatePath("/dashboard/juriste");
    revalidatePath(`/dashboard/juriste/${dossier.id}`);
    revalidatePath(`/dashboard/cases/${dossier.id}`);
    revalidatePath("/dashboard/admin/dossiers");
    if (envoi.ok) {
      redirect(`/dashboard/juriste/${dossier.id}?envoye=ok`);
    }
    return { error: envoi.error };
  }

  await prisma.dossier.update({
    where: { id: dossier.id },
    data: { canalEnvoi: canal },
  });

  // Canal en ligne : le lien de dépôt assisté est (ré)envoyé au client — il
  // dépose lui-même sa contestation sur le portail officiel puis marque le
  // dossier (page /recours/finaliser ou bouton « J'ai déposé » de son espace
  // client). Pas de soumission automatique.
  await activerDepotEnLigne({ dossierId: dossier.id, canal }).catch((e) => {
    console.error("envoyerContestation: échec (ré)émission du lien de dépôt", e);
    return null;
  });

  revalidatePath("/dashboard/juriste");
  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/admin/dossiers");
  redirect(`/dashboard/juriste/${dossier.id}?lien=envoye`);
}

/**
 * Envoi LRAR par nos soins : SOS Amende expédie la lettre recommandée avec
 * accusé de réception pour le compte du client. Verrou atomique PRET → ENVOYE
 * (jamais d'envoi en ligne sur ce canal), accusé de dépôt LRAR généré et
 * rattaché au courrier existant.
 */
export async function envoyerParLrar(
  dossierId: string,
  opts: { numeroRecommandé?: string } = {},
) {
  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    include: {
      preuves: { orderBy: { createdAt: "asc" } },
      courriers: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!dossier) return { ok: false as const, error: "Dossier introuvable." };
  if (dossier.statut !== "PRET" || !dossier.valideLe) {
    return {
      ok: false as const,
      error: "La contestation doit être validée et pas encore envoyée.",
    };
  }

  const numero = opts.numeroRecommandé || `LRAR-${Date.now().toString(36).toUpperCase()}`;

  const verrou = await prisma.dossier.updateMany({
    where: { id: dossier.id, statut: "PRET" },
    data: {
      statut: "ENVOYE",
      numeroDepot: numero,
      decisionAttendueLe: new Date(),
    },
  });
  if (verrou.count === 0) {
    return { ok: false as const, error: "Dossier déjà envoyé." };
  }

  const dataExt = (dossier.extractedData ?? {}) as Record<string, unknown>;
  const piecesJointes = listePiecesJointes({
    type: dossier.type,
    conditionsMeteo: dossier.conditions_meteo,
    numRef: typeof dataExt["num_pv"] === "string" ? (dataExt["num_pv"] as string) : null,
    preuves: dossier.preuves.map((p) => ({ nom: p.nom, type: p.type, url: p.url })),
  });

  const dateDepot = new Date().toISOString();
  let preuveUrl: string | null = null;
  try {
    const pdf = await generatePreuvePdf({
      numeroDepot: numero,
      dateDepot,
      numPv: typeof dataExt["num_pv"] === "string" ? (dataExt["num_pv"] as string) : "—",
      plaque: typeof dataExt["plaque"] === "string" ? (dataExt["plaque"] as string) : undefined,
      type: dossier.type,
      nom: typeof dataExt["nom"] === "string" ? (dataExt["nom"] as string) : undefined,
      organisme:
        dossier.type === "SUSPENSION" ? "Préfecture" : "OMP",
      preuves: piecesJointes,
      lrar: true,
    });
    preuveUrl = await storageWrite(`preuves/lrar-${dossier.id}-${Date.now()}.pdf`, pdf);
  } catch (e) {
    console.error("envoyerParLrar: génération accusé LRAR échouée", e);
  }

  const courrier = dossier.courriers[dossier.courriers.length - 1];
  await prisma.$transaction([
    ...(courrier
      ? [
          prisma.courrier.update({
            where: { id: courrier.id },
            data: { preuveDepotUrl: preuveUrl },
          }),
        ]
      : []),
    prisma.dossierEvent.create({
      data: {
        dossierId: dossier.id,
        type: "ENVOI",
        detail: `Envoyé par SOS Amende en lettre recommandée avec accusé de réception (n° ${numero}) — ${destinataireLrar(dossier.type)}.`,
      },
    }),
  ]);

  await notifierStatut(dossier.id).catch(() => false);

  return { ok: true as const, numeroDepot: numero };
}

export type VerifierFaillesState = {
  error?: string;
  ok?: boolean;
  message?: string;
} | undefined;

/**
 * « Vérifier les failles » (verification 2.0) : le juriste relance la
 * recherche des failles correspondant au cas d'espèce. La détection rejoue
 * sur un contexte enrichi (données extraites + questionnaire + pièces
 * versées + météo réelle + calibration radar) et, sur demande, l'IA
 * (Gemini/mock) cross-checke les faits contre le catalogue — uniquement des
 * ids du catalogue, chaque suggestion justifiée par un fait du dossier,
 * jamais d'article inventé, toujours en proposition (le juriste confirme).
 * Garde-fous : décisions CONFIRMEE/REJETEE préservées (aucun deleteMany),
 * pvTexte intact (remarques tracées en événement, plus annexées au texte),
 * lettre régénérée seulement si l'ensemble de candidats a changé.
 */
export async function verifierFailles(
  _prev: VerifierFaillesState,
  formData: FormData,
): Promise<VerifierFaillesState> {
  await requireJuristeRedacteur();

  const dossierId = String(formData.get("dossierId") ?? "");
  const remarques = String(formData.get("remarques") ?? "").trim();
  const utiliseIa = formData.get("ia") === "on";

  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    include: {
      user: { select: { name: true } },
      preuves: { select: { type: true, url: true } },
      faillesRetenues: { select: { failleId: true, statut: true } },
    },
  });
  if (!dossier) {
    return { error: "Dossier introuvable." };
  }
  if (
    dossier.statut !== "EN_ATTENTE_VALIDATION" &&
    dossier.statut !== "A_VERIFIER"
  ) {
    return {
      error:
        "La vérification des failles n'est disponible que sur un dossier en attente de validation.",
    };
  }

  const data = (dossier.extractedData ?? {}) as ExtractedData;
  const failles = await prisma.failleJuridique.findMany({
    where: { statut: "ACTIVE", typeInfraction: dossier.type },
  });

  // Contexte enrichi : faits du questionnaire + pièces versées (attestations
  // de vol/cession, relevé de paiement, chantiers) + météo réellement
  // récupérée — tout ce qui a pu être ajouté après l'analyse.
  const faits = faitsDepuisPreuves(data, dossier.preuves);
  if (!faits.conditions_meteo && dossier.conditions_meteo) {
    faits.conditions_meteo = dossier.conditions_meteo;
  }

  // Preuve d'entretien du radar : registre admin prioritaire, sinon date de
  // vérification lue sur le PV (même logique que l'analyse — `contexteEtalonnage`).
  const {
    dateExpiration: dateExpirationEtalonnage,
    preuveUrl: preuveEtalonnageRadar,
  } = await contexteEtalonnage(faits);

  // 1. Détection par règles sur le contexte enrichi (texte OCR inchangé).
  const detectesRegles = detecterFailles(
    faits,
    dossier.pvTexte,
    failles.map((f) => ({
      id: f.id,
      reglesDetection: f.reglesDetection as unknown as
        | RegleDetection[]
        | null,
    })),
    { dateExpirationEtalonnage },
  );

  // 2. Vérification approfondie IA (optionnelle) : faits × catalogue.
  const detectes = [...detectesRegles];
  const suggestions: MajSuggestion[] = [];
  const signalements: MajSuggestion[] = [];
  let messageIa: string | null = null;
  if (utiliseIa) {
    const catalogueIa = failles.map((f) => ({
      id: f.id,
      titreFaille: f.titreFaille,
      articleLoi: f.articleLoi,
      regle: f.regle ?? null,
      jurisprudence: (
        Array.isArray(f.jurisprudence)
          ? (f.jurisprudence as Array<{ resume?: unknown }>)
              .map((j) => j.resume)
              .filter((r): r is string => typeof r === "string" && r.length > 0)
          : []
      ).slice(0, 3),
    }));
    const faitsIa: Record<string, unknown> = {
      ...faits,
      type: dossier.type,
      textePv: (dossier.pvTexte ?? "").slice(0, 4000),
      remarquesJuriste: remarques || null,
      dateLimite: dossier.dateLimite
        ? dossier.dateLimite.toISOString().slice(0, 10)
        : null,
    };
    const resultat = await verifierAvecIa(faitsIa, catalogueIa);
    if (resultat.source === "indisponible") {
      messageIa = resultat.motif;
    } else {
      const at = new Date().toISOString();
      for (const s of resultat.reponse.suggestions) {
        suggestions.push({
          failleId: s.id,
          suggestionIa: {
            source: resultat.source,
            pertinence: s.pertinence,
            justification: s.justification,
            controle: s.controle,
            at,
          },
        });
        if (!detectes.includes(s.id)) detectes.push(s.id);
      }
      for (const s of resultat.reponse.signalements) {
        signalements.push({
          failleId: s.id,
          suggestionIa: {
            source: resultat.source,
            signalement: s.motif,
            at,
          },
        });
      }
      messageIa =
        resultat.source === "mock"
          ? "IA simulée (mock) : aucune analyse réelle."
          : `IA : ${suggestions.length} suggestion(s), ${signalements.length} signalement(s).`;
    }
  }

  // 3. Fusion avec les décisions du juriste : aucune confirmation/écart
  //    effacé, aucune faille écartée ressuscitée.
  const fusion = fusionnerCandidats(
    dossier.faillesRetenues,
    detectes,
    suggestions,
    signalements,
  );

  // La lettre n'est régénérée que si l'ensemble de candidats a changé — les
  // éditions/validations du juriste sont conservées sinon.
  const actifsAvant = dossier.faillesRetenues
    .filter((e) => e.statut === "CANDIDATE" || e.statut === "CONFIRMEE")
    .map((e) => e.failleId);
  const changement = !memesIds(fusion.idsLettre, actifsAvant);

  const principalId = fusion.idsLettre[0] ?? null;
  if (principalId === FAILLE_IDS.etalonnage && preuveEtalonnageRadar) {
    faits.preuveEtalonnage = preuveEtalonnageRadar;
  }

  let lettreGeneree: string | null | undefined;
  if (changement) {
    const candidatsFailles = fusion.idsLettre
      .map((id) => failles.find((f) => f.id === id))
      .filter((f): f is NonNullable<typeof f> => !!f);
    const lettre = remplirLettreMulti(
      candidatsFailles.map((f) => ({
        id: f.id,
        titreFaille: f.titreFaille,
        articleLoi: f.articleLoi,
        templateLettre: f.templateLettre,
      })),
      faits,
    );
    lettreGeneree = lettre
      ? formaterLettreOfficielle({
          type: dossier.type,
          corps: lettre,
          docType: data.docType,
          numRef: faits.num_pv ?? null,
          dateRef: faits.date ?? null,
          nom: dossier.user?.name ?? null,
          date: new Date().toISOString().slice(0, 10),
        })
      : null;
  }

  const detailVerif = [
    `Vérification des failles : ${fusion.idsLettre.length} en jeu (${fusion.nouvelles.length} nouvelle(s))`,
    messageIa,
    remarques ? `remarques : ${remarques}` : null,
  ]
    .filter(Boolean)
    .join(" — ");

  await prisma.$transaction([
    prisma.dossier.update({
      where: { id: dossier.id },
      data: {
        ...(remarques ? { remarquesJuriste: remarques } : {}),
        extractedData: faits as object,
        ...(changement
          ? {
              failleJuridiqueId: principalId,
              lettreGeneree: lettreGeneree ?? null,
            }
          : {}),
      },
    }),
    prisma.dossierEvent.create({
      data: {
        dossierId: dossier.id,
        type: "VERIFICATION_POUSSEE",
        detail: detailVerif,
      },
    }),
    ...(changement && lettreGeneree
      ? [
          prisma.dossierEvent.create({
            data: {
              dossierId: dossier.id,
              type: "LETTRE_GENEREE",
              detail: "Lettre régénérée après vérification des failles.",
            },
          }),
        ]
      : []),
    ...fusion.nouvelles.map((failleId) => {
      const s = suggestions.find((x) => x.failleId === failleId);
      return prisma.dossierFaille.create({
        data: {
          dossierId: dossier.id,
          failleId,
          statut: "CANDIDATE",
          ...(s ? { suggestionIa: s.suggestionIa as object } : {}),
        },
      });
    }),
    ...fusion.majs.map((m) =>
      prisma.dossierFaille.updateMany({
        where: { dossierId: dossier.id, failleId: m.failleId },
        data: { suggestionIa: m.suggestionIa as object },
      }),
    ),
  ]);

  revalidatePath("/dashboard/juriste");
  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/admin/dossiers");

  const message = [
    `Vérification effectuée : ${fusion.idsLettre.length} faille(s) en jeu, ${fusion.nouvelles.length} nouvelle(s).`,
    messageIa,
  ]
    .filter(Boolean)
    .join(" ");
  return { ok: true, message };
}

/**
 * Modification de la lettre générée par le juriste avant validation :
 *  - A_VERIFIER : la lettre n'est pas encore signée — seul le texte change ;
 *  - PRET : la lettre est signée — le PDF est régénéré en recollant
 *    automatiquement la signature existante en bas de la nouvelle lettre.
 * La signature est toujours réappliquée : le juriste n'a pas à la retracer.
 */
export async function modifierLettre(
  _prev: ValidationState,
  formData: FormData,
): Promise<ValidationState> {
  await requireJuristeRedacteur();

  const dossierId = String(formData.get("dossierId") ?? "");
  const lettre = String(formData.get("lettre") ?? "").trim();
  if (lettre.length < 10) {
    return { error: "La lettre doit contenir du texte." };
  }

  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    include: {
      courriers: { orderBy: { createdAt: "asc" } },
      preuves: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!dossier) {
    if (isDemoId(dossierId)) {
      // Dossier de démonstration (fallback mock sans ligne DB) : mémorise l'édition pour que le téléchargement reflète la prévisualisation
      setDemoLettre(dossierId, lettre);
      revalidatePath("/dashboard/juriste");
      revalidatePath(`/dashboard/juriste/${dossierId}`);
      return { ok: true };
    }
    return { error: "Dossier introuvable." };
  }
  if (
    dossier.statut !== "A_VERIFIER" &&
    dossier.statut !== "PRET" &&
    dossier.statut !== "EN_ATTENTE_VALIDATION"
  ) {
    return { error: "La lettre ne peut être modifiée qu'avant validation." };
  }

  const dataExt = (dossier.extractedData ?? {}) as Record<string, unknown>;
  const piecesJointes = listePiecesJointes({
    type: dossier.type,
    conditionsMeteo: dossier.conditions_meteo,
    numRef: typeof dataExt["num_pv"] === "string" ? (dataExt["num_pv"] as string) : null,
    preuves: dossier.preuves.map((p) => ({ nom: p.nom, type: p.type, url: p.url })),
  });

  const courrier = dossier.courriers[dossier.courriers.length - 1];
  let pdfUrl: string | null = courrier?.pdfUrl ?? null;
  if (courrier?.signatureUrl) {
    // Lettre déjà signée : on régénère le PDF avec la signature existante.
    // Si la signature ne peut pas être relue (fichier manquant, S3 indisponible),
    // on régénère quand même un PDF sans signature plutôt que de bloquer le juriste.
    const sig = await storageRead(courrier.signatureUrl);
    const sigDataUrl = sig ? `data:image/png;base64,${sig.toString("base64")}` : null;
    try {
      const pdfBuffer = await generateLettrePdf(lettre, sigDataUrl, piecesJointes);
      pdfUrl = await storageWrite(
        `pdfs/lettre-${dossier.id}-${Date.now()}.pdf`,
        pdfBuffer,
      );
    } catch (e) {
      console.error("modifierLettre: génération PDF échouée", e);
      // On sauvegarde au moins le texte même si le PDF échoue
    }
  } else if (courrier) {
    // Lettre signée sans signature PNG (cas rare) : régénère un PDF sans signature
    try {
      const pdfBuffer = await generateLettrePdf(lettre, null, piecesJointes);
      pdfUrl = await storageWrite(
        `pdfs/lettre-${dossier.id}-${Date.now()}.pdf`,
        pdfBuffer,
      );
    } catch (e) {
      console.error("modifierLettre: génération PDF sans signature échouée", e);
    }
  }

  await prisma.$transaction([
    prisma.dossier.update({
      where: { id: dossier.id },
      data: { lettreGeneree: lettre },
    }),
    ...(courrier && pdfUrl
      ? [
          prisma.courrier.update({
            where: { id: courrier.id },
            data: { pdfUrl },
          }),
        ]
      : []),
    prisma.dossierEvent.create({
      data: {
        dossierId: dossier.id,
        type: "LETTRE_GENEREE",
        detail: "Lettre modifiée par le juriste.",
      },
    }),
  ]);

  revalidatePath("/dashboard/juriste");
  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/admin/dossiers");
  return { ok: true };
}

export type GenererVarianteState = { error?: string; ok?: boolean } | undefined;

/**
 * Générateur de lettre (variantes) : le juriste ne se retrouve pas avec une
 * seule lettre pré-rédigée — il choisit une combinaison de failles connues
 * (candidates du dossier, statut ACTIVE) et le moteur régénère une lettre
 * depuis les templates de la base juridique, puis l'habille officiellement.
 * Aucun texte hors template : seules les failles ACTIVE validées par l'admin
 * alimentent la réponse (anti-hallucination).
 *
 * Fenêtre : A_VERIFIER / PRET / EN_ATTENTE_VALIDATION (idem modifierLettre).
 *  - A_VERIFIER : seule la lettre (texte) change ;
 *  - PRET : la lettre est signée — le PDF est régénéré en recollant
 *    automatiquement la signature existante en bas de la nouvelle lettre.
 */
export async function genererVarianteLettre(
  _prev: GenererVarianteState,
  formData: FormData,
): Promise<GenererVarianteState> {
  await requireJuristeRedacteur();

  const dossierId = String(formData.get("dossierId") ?? "");
  const failleIds = formData
    .getAll("failleId")
    .map((v) => String(v))
    .filter(Boolean);
  if (failleIds.length === 0) {
    return { error: "Sélectionnez au moins une faille pour réécrire la lettre." };
  }

  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    include: {
      user: { select: { name: true } },
      courriers: { orderBy: { createdAt: "asc" } },
      preuves: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!dossier) {
    if (isDemoId(dossierId)) {
      // Dossier de démonstration : pas de base de failles — on refuse poliment
      // (le composant n'est pas rendu sur les dossiers démo, garde défensive).
      return { error: "Générateur indisponible sur un dossier de démonstration." };
    }
    return { error: "Dossier introuvable." };
  }
  if (
    dossier.statut !== "A_VERIFIER" &&
    dossier.statut !== "PRET" &&
    dossier.statut !== "EN_ATTENTE_VALIDATION"
  ) {
    return { error: "La lettre ne peut plus être réécrite après l'envoi." };
  }

  // 1) Failles sélectionnées : ACTIVE + du bon type + template présent.
  const failles = await prisma.failleJuridique.findMany({
    where: { id: { in: failleIds } },
  });
  const parId = new Map(failles.map((f) => [f.id, f]));
  const retenues = failleIds
    .map((id) => parId.get(id))
    .filter(
      (f): f is NonNullable<typeof f> =>
        !!f &&
        f.statut === "ACTIVE" &&
        !!f.templateLettre &&
        f.typeInfraction === dossier.type,
    );
  if (retenues.length === 0) {
    return {
      error:
        "Aucune des failles sélectionnées n'est utilisable (statut ACTIVE, type du dossier, template présent).",
    };
  }

  const data = (dossier.extractedData ?? {}) as ExtractedData;
  const lettre = remplirLettreMulti(
    retenues.map((f) => ({
      id: f.id,
      titreFaille: f.titreFaille,
      articleLoi: f.articleLoi,
      templateLettre: f.templateLettre,
    })),
    data,
  );

  const docVariante = (dossier.extractedData ?? {}) as Record<string, unknown>;
  const lettreOfficielle = formaterLettreOfficielle({
    type: dossier.type,
    corps: lettre ?? "",
    docType: lireDocType(docVariante["docType"]),
    numRef: typeof docVariante["num_pv"] === "string" ? (docVariante["num_pv"] as string) : null,
    dateRef: typeof docVariante["date"] === "string" ? (docVariante["date"] as string) : null,
    nom: dossier.user?.name ?? null,
    date: new Date().toISOString().slice(0, 10),
  });

  // 2) PDF signé : si la lettre a déjà été signée (PRET), on régénère le PDF
  //    en recollant la signature existante (règle partagée avec modifierLettre).
  const courrier = dossier.courriers[dossier.courriers.length - 1];
  const piecesJointes = listePiecesJointes({
    type: dossier.type,
    conditionsMeteo: dossier.conditions_meteo,
    numRef: typeof docVariante["num_pv"] === "string" ? (docVariante["num_pv"] as string) : null,
    preuves: dossier.preuves.map((p) => ({ nom: p.nom, type: p.type, url: p.url })),
  });
  let pdfUrl: string | null = courrier?.pdfUrl ?? null;
  if (courrier?.signatureUrl) {
    const sig = await storageRead(courrier.signatureUrl);
    const sigDataUrl = sig ? `data:image/png;base64,${sig.toString("base64")}` : null;
    try {
      const pdfBuffer = await generateLettrePdf(lettreOfficielle, sigDataUrl, piecesJointes);
      pdfUrl = await storageWrite(`pdfs/lettre-${dossier.id}-${Date.now()}.pdf`, pdfBuffer);
    } catch (e) {
      console.error("genererVarianteLettre: génération PDF échouée", e);
    }
  } else if (courrier) {
    try {
      const pdfBuffer = await generateLettrePdf(lettreOfficielle, null, piecesJointes);
      pdfUrl = await storageWrite(`pdfs/lettre-${dossier.id}-${Date.now()}.pdf`, pdfBuffer);
    } catch (e) {
      console.error("genererVarianteLettre: génération PDF sans signature échouée", e);
    }
  }

  // 3) Persistance : nouvelle lettre + faille principale + événement. Une
  //    seule faille principale par dossier : la première retenue passe en
  //    CONFIRMEE, les autres retenues (juxtaposées dans la lettre) restent
  //    CANDIDATE — cohérent avec confirmerFaille.
  await prisma.$transaction([
    prisma.dossierFaille.updateMany({
      where: { dossierId: dossier.id, statut: "CONFIRMEE" },
      data: { statut: "CANDIDATE" },
    }),
    prisma.dossier.update({
      where: { id: dossier.id },
      data: {
        lettreGeneree: lettreOfficielle,
        failleJuridiqueId: retenues[0].id,
      },
    }),
    ...(courrier && pdfUrl
      ? [
          prisma.courrier.update({
            where: { id: courrier.id },
            data: { pdfUrl },
          }),
        ]
      : []),
    ...retenues.map((f, i) =>
      prisma.dossierFaille.upsert({
        where: { dossierId_failleId: { dossierId: dossier.id, failleId: f.id } },
        create: {
          dossierId: dossier.id,
          failleId: f.id,
          statut: i === 0 ? "CONFIRMEE" : "CANDIDATE",
        },
        update: { statut: i === 0 ? "CONFIRMEE" : "CANDIDATE" },
      }),
    ),
    prisma.dossierEvent.create({
      data: {
        dossierId: dossier.id,
        type: "LETTRE_GENEREE",
        detail: `Lettre réécrite (variante) — ${retenues.map((f) => f.titreFaille).join(", ")}`,
      },
    }),
  ]);

  revalidatePath("/dashboard/juriste");
  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/admin/dossiers");
  return { ok: true };
}

export async function retournerDossier(
  _prev: ValidationState,
  formData: FormData,
): Promise<ValidationState> {
  await requireJuristeRedacteur();

  const dossierId = String(formData.get("dossierId") ?? "");
  const dossier = await prisma.dossier.findUnique({ where: { id: dossierId } });
  if (!dossier) {
    if (isDemoId(dossierId)) {
      revalidatePath("/dashboard/juriste");
      revalidatePath(`/dashboard/juriste/${dossierId}`);
      redirect(`/dashboard/juriste/${dossierId}?retourne=ok`);
    }
    return { error: "Dossier introuvable." };
  }
  if (dossier.statut !== "PRET" && dossier.statut !== "EN_ATTENTE_VALIDATION") {
    return { error: "Seul un dossier en attente de validation peut être retourné." };
  }

  await prisma.$transaction([
    prisma.dossier.update({
      where: { id: dossier.id },
      data: { statut: "EN_ANALYSE", valideLe: null },
    }),
    prisma.dossierEvent.create({
      data: { dossierId: dossier.id, type: "RETOUR" },
    }),
  ]);

  // Notification (défensive : sans AUTH_RESEND_KEY, aucun e-mail envoyé).
  await notifierStatut(dossier.id).catch(() => false);

  revalidatePath("/dashboard/juriste");
  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/admin/dossiers");
  redirect(`/dashboard/juriste/${dossier.id}?retourne=ok`);
}

export async function rejeterDossier(
  _prev: ValidationState,
  formData: FormData,
): Promise<ValidationState> {
  await requireJuristeRedacteur();

  const dossierId = String(formData.get("dossierId") ?? "");
  const motif = String(formData.get("motif") ?? "").trim();
  if (motif.length < 10) {
    return { error: "Un motif de rejet d'au moins 10 caractères est requis." };
  }

  const dossier = await prisma.dossier.findUnique({ where: { id: dossierId } });
  if (!dossier) {
    if (isDemoId(dossierId)) {
      revalidatePath("/dashboard/juriste");
      revalidatePath(`/dashboard/juriste/${dossierId}`);
      redirect(`/dashboard/juriste/${dossierId}?rejete=ok`);
    }
    return { error: "Dossier introuvable." };
  }
  if (
    dossier.statut !== "PRET" &&
    dossier.statut !== "A_VERIFIER" &&
    dossier.statut !== "EN_ATTENTE_VALIDATION" &&
    dossier.statut !== "EN_ATTENTE_PRE_SIGNATURE"
  ) {
    return { error: "Seul un dossier en attente peut être rejeté." };
  }

  const dejaRejete = await prisma.$transaction(async (tx) => {
    // Verrou anti double-rejet : la transition n'est acceptée que depuis un
    // statut éligible — sinon aucun remboursement (crédit rendu au plus une fois).
    const verrou = await tx.dossier.updateMany({
      where: {
        id: dossier.id,
        statut: {
          in: [
            "PRET",
            "A_VERIFIER",
            "EN_ATTENTE_VALIDATION",
            "EN_ATTENTE_PRE_SIGNATURE",
          ],
        },
      },
      data: { statut: "REJETE", motifRejet: motif },
    });
    if (verrou.count === 0) return true;

    await tx.dossierEvent.create({
      data: { dossierId: dossier.id, type: "REJET", detail: motif },
    });
    // Aucune lettre transmise : le crédit consommé au dépôt est rendu au client
    // (il peut lancer un nouveau dossier sans repayer).
    await tx.user.update({
      where: { id: dossier.userId },
      data: { credits: { increment: 1 } },
    });
    return false;
  });
  if (dejaRejete) {
    return { error: "Seul un dossier en attente peut être rejeté." };
  }

  // Notification (défensive : sans AUTH_RESEND_KEY, aucun e-mail envoyé).
  await notifierStatut(dossier.id).catch(() => false);

  revalidatePath("/dashboard/juriste");
  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/admin/dossiers");
  redirect(`/dashboard/juriste/${dossier.id}?rejete=ok`);
}

export type TraiterAvocatState = { error?: string } | undefined;

export type TraiterFailleState = { error?: string } | undefined;

/**
 * Confirmation d'une faille candidate par le juriste : elle devient la faille
 * principale du dossier et la lettre est régénérée en juxtaposant la faille
 * confirmée aux autres failles toujours candidates (les écartées sont
 * exclues). La base juridique s'alimente par ces validations.
 */
export async function confirmerFaille(
  _prev: TraiterFailleState,
  formData: FormData,
): Promise<TraiterFailleState> {
  await requireJuristeRedacteur();

  const dossierId = String(formData.get("dossierId") ?? "");
  const failleId = String(formData.get("failleId") ?? "");

  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    include: { user: { select: { name: true } } },
  });
  if (!dossier) {
    if (isDemoId(dossierId)) return undefined;
    return { error: "Dossier introuvable." };
  }
  if (
    dossier.statut !== "A_VERIFIER" &&
    dossier.statut !== "PRET" &&
    dossier.statut !== "EN_ATTENTE_VALIDATION"
  ) {
    return {
      error:
        "La faille ne peut être confirmée que tant que la lettre n'est pas envoyée.",
    };
  }
  const faille = await prisma.failleJuridique.findUnique({
    where: { id: failleId },
  });
  if (!faille) {
    return { error: "Faille introuvable." };
  }
  // Garde-fou : seules les failles validées par l'admin (ACTIVE) alimentent
  // les lettres — jamais une proposition (PROPOSEE) ni une écartée (INACTIVE).
  if (faille.statut !== "ACTIVE") {
    return {
      error: "Cette faille n'est pas validée par la base juridique (ACTIVE).",
    };
  }
  // Garde-fou lettre vide (lot M) : une faille ACTIVE dont le template n'est
  // pas encore rédigé (faille de la veille validée avant rédaction) ne peut
  // pas devenir principale — elle ne produirait aucune contestation.
  if (!faille.templateLettre.trim()) {
    return {
      error:
        "Template de lettre à rédiger dans la bibliothèque juridique avant de retenir cette faille.",
    };
  }

  const data = (dossier.extractedData ?? {}) as ExtractedData;

  // 1) Une seule faille principale par dossier : la confirmation écarte la
  //    précédente en tant que principale (elle redevient candidate).
  await prisma.$transaction([
    prisma.dossierFaille.updateMany({
      where: { dossierId, statut: "CONFIRMEE" },
      data: { statut: "CANDIDATE" },
    }),
    prisma.dossierFaille.upsert({
      where: { dossierId_failleId: { dossierId, failleId } },
      create: { dossierId, failleId, statut: "CONFIRMEE" },
      update: { statut: "CONFIRMEE" },
    }),
  ]);

  // 2) Lettre multi-arguments : la faille confirmée (en premier) est
  //    juxtaposée aux autres failles toujours candidates — jamais une écartée.
  const retenues = await prisma.dossierFaille.findMany({
    where: {
      dossierId,
      statut: { in: ["CONFIRMEE", "CANDIDATE"] },
      faille: { statut: "ACTIVE" },
    },
    include: { faille: true },
  });
  retenues.sort(
    (a, b) =>
      Number(b.statut === "CONFIRMEE") - Number(a.statut === "CONFIRMEE"),
  );
  const lettre = remplirLettreMulti(
    retenues.map((df) => ({
      id: df.faille.id,
      titreFaille: df.faille.titreFaille,
      articleLoi: df.faille.articleLoi,
      templateLettre: df.faille.templateLettre,
    })),
    data,
  );

  await prisma.$transaction([
    prisma.dossier.update({
      where: { id: dossier.id },
      data: { failleJuridiqueId: faille.id, lettreGeneree: lettre },
    }),
    prisma.dossierEvent.create({
      data: {
        dossierId: dossier.id,
        type: "LETTRE_GENEREE",
        detail: `Faille retenue par le juriste : ${faille.titreFaille}`,
      },
    }),
  ]);

  const docConfirme = (dossier.extractedData ?? {}) as Record<string, unknown>;
  const lettreOfficielle = formaterLettreOfficielle({
    type: dossier.type,
    corps: lettre ?? "",
    docType: lireDocType(docConfirme["docType"]),
    numRef: typeof docConfirme["num_pv"] === "string" ? (docConfirme["num_pv"] as string) : null,
    dateRef: typeof docConfirme["date"] === "string" ? (docConfirme["date"] as string) : null,
    nom: dossier.user?.name ?? null,
    date: new Date().toISOString().slice(0, 10),
  });
  if (lettreOfficielle !== lettre) {
    await prisma.dossier.update({
      where: { id: dossier.id },
      data: { lettreGeneree: lettreOfficielle },
    });
  }

  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/admin/dossiers");
  return undefined;
}

/**
 * Rejet d'une faille candidate par le juriste : elle ne sera pas utilisée
 * pour ce dossier (l'alimentation de la base conserve le statut du candidat).
 */
export async function rejeterFaille(
  _prev: TraiterFailleState,
  formData: FormData,
): Promise<TraiterFailleState> {
  await requireJuristeRedacteur();

  const dossierId = String(formData.get("dossierId") ?? "");
  const failleId = String(formData.get("failleId") ?? "");

  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
  });
  if (!dossier) {
    if (isDemoId(dossierId)) return undefined;
    return { error: "Dossier introuvable." };
  }

  await prisma.$transaction([
    prisma.dossierFaille.upsert({
      where: { dossierId_failleId: { dossierId, failleId } },
      create: { dossierId, failleId, statut: "REJETEE" },
      update: { statut: "REJETEE" },
    }),
    prisma.dossierEvent.create({
      data: {
        dossierId: dossier.id,
        type: "ANALYSE",
        detail: "Faille écartée par le juriste.",
      },
    }),
  ]);

  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/admin/dossiers");
  return undefined;
}

const AVOCAT_ACTIONS = ["AFFECTE", "REFUSE"] as const;

/**
 * Mise en relation avocat (PLAN §2) : le juriste affecte un avocat partenaire
 * au dossier (AFFECTE) ou refuse la demande (REFUSE, note au client).
 */
export async function traiterDemandeAvocat(
  _prev: TraiterAvocatState,
  formData: FormData,
): Promise<TraiterAvocatState> {
  await requireJuristeRedacteur();

  const matchId = String(formData.get("matchId") ?? "");
  const action = AVOCAT_ACTIONS.find((a) => a === formData.get("action"));

  const match = await prisma.lawyerMatch.findUnique({
    where: { id: matchId },
    include: { dossier: true },
  });
  if (!match) {
    return { error: "Demande introuvable." };
  }
  if (match.statut !== "DEMANDE") {
    return { error: "Cette demande a déjà été traitée." };
  }

  if (action === "AFFECTE") {
    const partnerName = String(formData.get("partnerName") ?? "").trim();
    if (partnerName.length < 2) {
      return { error: "Le nom de l'avocat partenaire est requis." };
    }
    await prisma.lawyerMatch.update({
      where: { id: match.id },
      data: {
        statut: "AFFECTE",
        partnerName,
        partnerBarreau: String(formData.get("partnerBarreau") ?? "").trim() || null,
        partnerEmail: String(formData.get("partnerEmail") ?? "").trim() || null,
        note: String(formData.get("note") ?? "").trim() || null,
      },
    });
  } else if (action === "REFUSE") {
    const note = String(formData.get("note") ?? "").trim();
    if (note.length < 10) {
      return { error: "Une note d'au moins 10 caractères est requise pour refuser." };
    }
    await prisma.lawyerMatch.update({
      where: { id: match.id },
      data: { statut: "REFUSE", note },
    });
  } else {
    return { error: "Action invalide." };
  }

  revalidatePath(`/dashboard/juriste/${match.dossierId}`);
  revalidatePath(`/dashboard/cases/${match.dossierId}`);
  return undefined;
}

export type PreuvesApiState = {
  ok?: boolean;
  error?: string;
  ajoutees?: string[];
  verifiees?: string[];
  /** Sources injoignables / données absentes — distinct de « rien trouvé ». */
  alertes?: string[];
};

/**
 * Vérification des preuves externes (météo, fiche radar, travaux) pour un
 * dossier, depuis les sources publiques. Anti-redondance : les preuves déjà
 * identifiées sont revérifiées mais jamais re-créées — seules les preuves non
 * encore répertoriées sont ajoutées. Best-effort. `alertes` distingue une
 * source injoignable d'un résultat vide (P2 transparence).
 */
export async function recupererPreuvesApi(
  dossierId: string,
): Promise<PreuvesApiState> {
  await requireJuristeRedacteur();

  if (isDemoId(dossierId)) return { ok: true, ajoutees: [], verifiees: [] };

  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    select: { id: true },
  });
  if (!dossier) return { error: "Dossier introuvable." };

  const { ajoutees, verifiees, alertes } = await recupererPreuvesPourDossierId(
    prisma,
    dossierId,
  );
  revalidatePath(`/dashboard/juriste/${dossierId}`);
  revalidatePath(`/dashboard/cases/${dossierId}`);
  return { ok: true, ajoutees, verifiees, alertes };
}

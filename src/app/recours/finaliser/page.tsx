import { verifierLienDepot } from "@/lib/lien-depot";
import { ConfirmerDepotForm } from "./confirmer-depot";

export const dynamic = "force-dynamic";

const PORTAL_URL: Record<string, string> = {
  ANTAI: "https://usagers.antai.gouv.fr/demarches/saisienumero",
  TELERECOURS: "https://citoyens.telerecours.fr",
};

export default async function FinaliserPage(props: {
  searchParams: Promise<{ token?: string }>;
}) {
  const searchParams = await props.searchParams;
  const token = typeof searchParams.token === "string" ? searchParams.token : "";

  const lien = await verifierLienDepot(token);

  if (!lien) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-10 text-center">
          <h1 className="text-xl font-bold text-red-900">Lien invalide ou expiré</h1>
          <p className="mt-2 text-sm text-red-800">
            Ce lien de dépôt n&apos;est plus valable (lien absent, expiré ou déjà
            utilisé). Recontactez-nous si vous pensez qu&apos;il s&apos;agit d&apos;une erreur.
          </p>
        </div>
      </div>
    );
  }

  const { dossier, expireLe } = lien;
  const montant = dossier.montant > 0
    ? `${dossier.montant.toLocaleString("fr-FR")} €`
    : null;

  const statutPret = dossier.statut === "PRET";
  const dejaTransmis =
    dossier.statut === "ENVOYE" || dossier.statut === "RESOLU";

  const fichiers = dossier.fichiers;
  const aDesFichiers =
    Boolean(fichiers.lettrePdf) ||
    Boolean(fichiers.pv) ||
    fichiers.preuves.length > 0 ||
    Boolean(fichiers.pack.refere) ||
    Boolean(fichiers.pack.bordereau);
  const hrefFichier = (doc: string, preuveId?: string) =>
    `/api/recours/finaliser/fichier?token=${encodeURIComponent(token)}&doc=${doc}` +
    (preuveId ? `&preuveId=${encodeURIComponent(preuveId)}` : "");

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Lien personnel et sécurisé — valable jusqu&apos;au{" "}
        {expireLe.toLocaleDateString("fr-FR")}.
      </div>

      <h1 className="mt-6 text-2xl font-bold">
        Déposer ma contestation ({dossier.type === "SUSPENSION" ? "Télérecours" : "ANTAI"})
      </h1>
      <p className="mt-2 text-zinc-600">
        Bonjour {dossier.nomClient}, votre lettre de contestation
        {dossier.numRef !== "—" ? ` n° ${dossier.numRef}` : ""} est prête. Voici
        la démarche à suivre pour la transmettre au service compétent.
      </p>

      {!statutPret && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="font-semibold text-zinc-800">
            {dejaTransmis
              ? "Contestation déjà transmise"
              : "Votre lettre n’est pas encore prête"}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            {dejaTransmis
              ? "Votre contestation est déjà enregistrée. Vous pouvez suivre son avancement depuis votre espace client."
              : "Votre lettre est en cours de finalisation (validation ou signature). Revenez sur ce lien une fois la signature effectuée, ou connectez-vous à votre espace client."}
          </p>
        </div>
      )}

      {statutPret && (
        <>
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="font-semibold text-zinc-800">Votre dossier</h2>
            <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-lg bg-zinc-50 p-3">
                <dt className="text-xs uppercase tracking-wide text-zinc-500">
                  {dossier.type === "SUSPENSION" ? "Décision de suspension" : "Avis de contravention"}
                </dt>
                <dd className="mt-0.5 font-medium text-zinc-800">{dossier.numRef}</dd>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3">
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Véhicule</dt>
                <dd className="mt-0.5 font-medium text-zinc-800">{dossier.plaque}</dd>
              </div>
              {montant && (
                <div className="rounded-lg bg-zinc-50 p-3">
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Montant</dt>
                  <dd className="mt-0.5 font-medium text-zinc-800">{montant}</dd>
                </div>
              )}
              <div className="rounded-lg bg-zinc-50 p-3">
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Portail officiel</dt>
                <dd className="mt-0.5 font-medium text-zinc-800">
                  {dossier.type === "SUSPENSION" ? "Télérecours Citoyens" : "ANTAI"}
                </dd>
              </div>
            </dl>
          </div>

          {aDesFichiers && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
              <h2 className="font-semibold text-emerald-900">
                Télécharger les pièces à joindre au dépôt
              </h2>
              <p className="mt-1 text-sm text-emerald-800">
                Votre dossier est prêt. Téléchargez ces pièces puis joignez-les
                au dépôt sur le portail officiel.
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {fichiers.lettrePdf && (
                  <li>
                    <a
                      href={hrefFichier("lettre")}
                      className="inline-flex items-center gap-1.5 font-medium text-emerald-800 underline hover:text-emerald-950"
                    >
                      Télécharger la lettre signée (PDF)
                    </a>
                  </li>
                )}
                {fichiers.pack.refere && (
                  <li>
                    <a
                      data-testid="pack-refere"
                      href={hrefFichier("refere")}
                      className="inline-flex items-center gap-1.5 font-medium text-emerald-800 underline hover:text-emerald-950"
                    >
                      Télécharger le référé-suspension (art. L. 521-2 CJA)
                    </a>
                  </li>
                )}
                {fichiers.pack.bordereau && (
                  <li>
                    <a
                      data-testid="pack-bordereau"
                      href={hrefFichier("bordereau")}
                      className="inline-flex items-center gap-1.5 font-medium text-emerald-800 underline hover:text-emerald-950"
                    >
                      Télécharger le bordereau des pièces
                    </a>
                  </li>
                )}
                {fichiers.pv && (
                  <li>
                    <a
                      href={hrefFichier("pv")}
                      className="inline-flex items-center gap-1.5 font-medium text-emerald-800 underline hover:text-emerald-950"
                    >
                      Télécharger la{" "}
                      {dossier.type === "SUSPENSION"
                        ? "décision de suspension"
                        : "copie de l'avis de contravention"}
                    </a>
                  </li>
                )}
                {fichiers.preuves.map((p) => (
                  <li key={p.id}>
                    <a
                      href={hrefFichier("preuve", p.id)}
                      className="inline-flex items-center gap-1.5 font-medium text-emerald-800 underline hover:text-emerald-950"
                    >
                      Télécharger la pièce : {p.nom}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dossier.radar && dossier.type === "AMENDE" && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <strong>Mise en garde :</strong> pour une infraction relevée par
              radar, la contestation en ligne peut nécessiter la consignation
              du montant de l&apos;amende. Vérifiez dans votre avis si la
              consignation est exigée avant de déposer.
            </div>
          )}

          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="font-semibold text-zinc-800">La démarche</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-700">
              <li>
                Cliquez sur le bouton ci-dessous pour ouvrir le portail officiel{" "}
                {dossier.type === "SUSPENSION" ? "Télérecours Citoyens" : "ANTAI"}.
              </li>
              <li>
                Saisissez le numéro de {dossier.type === "SUSPENSION" ? "la décision" : "l’avis de contravention"}{" "}
                <strong>{dossier.numRef}</strong> (et votre plaque{" "}
                <strong>{dossier.plaque}</strong> si demandé).
              </li>
              <li>
                Téléchargez votre lettre et vos pièces (bloc au-dessus de ce
                guide), puis joignez-les au dépôt. La consignation, si elle est
                exigée, se règle directement sur le portail.
              </li>
              <li>
                Revenez sur cette page et cliquez sur « J’ai déposé ma
                contestation » : nous enregistrons la transmission et suivons la
                décision pour vous.
              </li>
            </ol>
            <div className="mt-4 flex flex-col gap-3">
              <a
                href={PORTAL_URL[dossier.canal] ?? PORTAL_URL.ANTAI}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Ouvrir le portail officiel ({dossier.type === "SUSPENSION" ? "Télérecours" : "ANTAI"})
              </a>
              <ConfirmerDepotForm token={token} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
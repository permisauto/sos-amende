import { delaiLibelle, destinataireLrar, type InfractionType } from "@/lib/envoi";

/**
 * Suivi informatif après validation juriste (PRET + valideLe) : le client n'a
 * plus aucune action à réaliser — SOS Amende transmet la contestation par nos
 * soins (en ligne via le portail officiel ou en lettre recommandée avec accusé
 * de réception). L'accusé de dépôt est conservé comme justificatif.
 */
export function EnvoiSuivi({
  dateLimite,
  type,
}: {
  dateLimite?: Date | null;
  type: InfractionType;
}) {
  return (
    <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-emerald-900">
          Contestation validée — transmission par SOS Amende
        </h2>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
          Prête pour l&apos;envoi
        </span>
      </div>
      <p className="mt-2 text-sm text-emerald-800">
        Votre lettre de contestation a été vérifiée et validée par un juriste.
        SOS Amende la transmet pour votre compte — par nos soins, plus aucune
        action n&apos;est requise de votre part.
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-emerald-800">
        <li>
          Transmission en ligne via le portail officiel, ou en lettre
          recommandée avec accusé de réception {destinataireLrar(type)}.
        </li>
        {dateLimite && (
          <li>
            Délai de contestation : à respecter avant le{" "}
            <strong>{dateLimite.toLocaleDateString("fr-FR")}</strong> (
            {delaiLibelle(type)}).
          </li>
        )}
        <li>L&apos;accusé de dépôt apparaîtra dans votre suivi une fois transmis.</li>
      </ul>
    </div>
  );
}
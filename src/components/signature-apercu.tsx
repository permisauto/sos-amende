/**
 * Aperçu de la signature du client, affiché à côté de la lettre générée dès
 * qu'une signature existe (apposée sur le courrier, ou signature de profil
 * capturée au dépôt du dossier).
 */
export function SignatureApercu({
  signatureUrl,
  label = "Signature du client",
  note,
}: {
  signatureUrl: string | null;
  label?: string;
  note?: string;
}) {
  if (!signatureUrl) return null;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={signatureUrl}
        alt={label}
        className="mt-2 h-16 w-auto rounded-lg border border-zinc-200 bg-white p-1"
      />
      {note && <p className="mt-2 text-xs leading-relaxed text-zinc-500">{note}</p>}
    </div>
  );
}
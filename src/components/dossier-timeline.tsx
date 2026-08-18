const EVENT_LABELS: Record<string, string> = {
  CREATION: "Dossier créé",
  ANALYSE: "Données analysées",
  LETTRE_GENEREE: "Lettre de contestation générée",
  EN_ATTENTE: "En attente d'examen par un juriste",
  SIGNATURE: "Lettre signée électroniquement",
  VALIDATION: "Validation par le juriste",
  ENVOI: "Envoyé par le client en recommandé (LRAR)",
  DECISION: "Décision OMP enregistrée",
  REJET: "Dossier rejeté",
  RETOUR: "Retourné pour correction",
  PREUVE: "Pièce justificative ajoutée",
};

export type TimelineEvent = {
  type: string;
  detail: string | null;
  detailUrl?: string | null;
  createdAt: Date;
};

function isUrl(v: string | null | undefined): boolean {
  if (!v) return false;
  return v.startsWith("/uploads/") || /^https?:\/\//i.test(v);
}

export function DossierTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Suivi du dossier
      </h2>
      <ol className="mt-4 space-y-4">
        {events.map((event, i) => (
          <li key={`${event.type}-${i}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-600" />
              {i < events.length - 1 && (
                <span className="w-px flex-1 bg-zinc-200" />
              )}
            </div>
            <div className="pb-1">
              <p className="text-sm font-medium text-zinc-800">
                {EVENT_LABELS[event.type] ?? event.type}
              </p>
              {event.detail &&
                (event.type === "ENVOI" && isUrl(event.detailUrl ?? event.detail) ? (
                  <a
                    href={event.detailUrl ?? event.detail}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 inline-block text-sm font-medium text-emerald-700 hover:underline"
                  >
                    Voir l&apos;accusé de dépôt
                  </a>
                ) : (
                  <p className="mt-0.5 text-sm text-zinc-600">{event.detail}</p>
                ))}
              <p className="mt-0.5 text-xs text-zinc-400">
                {event.createdAt.toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
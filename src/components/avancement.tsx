// Barre d'avancement unifiée — client, juriste, admin (même visual, même source).
const PIERRE = [
  "BROUILLON",
  "EN_ANALYSE",
  "EN_ATTENTE_PAIEMENT",
  "EN_ATTENTE_VALIDATION",
  "EN_ATTENTE_PRE_SIGNATURE",
  "PRET",
  "ENVOYE",
  "RESOLU",
] as const;

const TERMINAL = new Set(["REJETE", "ERREUR_TECHNIQUE", "ANNULE"]);

const LIBELLES_PIERRE = [
  "Brouillon",
  "Analyse",
  "Paiement",
  "À valider",
  "Signature",
  "Prêt",
  "Envoyé",
  "Résolu",
];

function etapeIndexes(statut: string): { courant: number; total: number } {
  const idx = PIERRE.indexOf(statut as (typeof PIERRE)[number]);
  if (idx >= 0) return { courant: idx, total: PIERRE.length - 1 };
  return { courant: 0, total: PIERRE.length - 1 };
}

function Barre({ courant, total }: { courant: number; total: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full ${
            i <= courant
              ? i < total
                ? "bg-emerald-500"
                : "bg-emerald-600"
              : "bg-zinc-200"
          }`}
        />
      ))}
    </div>
  );
}

type Variante = "complet" | "compact" | "badge";

interface AvancementProps {
  statut: string;
  variante?: Variante;
  /** Affiche le libellé "Étape X / Y — Label" */
  withLabel?: boolean;
}

export function Avancement({
  statut,
  variante = "complet",
  withLabel = true,
}: AvancementProps) {
  if (TERMINAL.has(statut)) {
    const label = "Clôturé";
    if (variante === "badge") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-500">
          <span className="h-1.5 w-8 overflow-hidden rounded-full bg-zinc-200" />
          {label}
        </span>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100" />
        {withLabel && (
          <span className="text-[11px] font-medium text-zinc-500">{label}</span>
        )}
      </div>
    );
  }

  const { courant, total } = etapeIndexes(statut);
  const label = LIBELLES_PIERRE[courant] ?? statut;

  if (variante === "badge") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800">
        <div className="flex gap-0.5">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-2.5 rounded ${
                i <= courant ? "bg-emerald-500" : "bg-zinc-200"
              }`}
            />
          ))}
        </div>
        <span>Étape {courant + 1} / {total}</span>
      </span>
    );
  }

  if (variante === "compact") {
    return (
      <div className="flex items-center gap-2">
        <Barre courant={courant} total={total} />
        {withLabel && (
          <span className="text-[11px] font-medium text-zinc-500 whitespace-nowrap">
            {label}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Barre courant={courant} total={total} />
      {withLabel && (
        <span className="text-[11px] font-medium text-zinc-500">
          Étape {courant + 1} / {total} — {label}
        </span>
      )}
    </div>
  );
}

// Paiement : dépôt (étape 1/2) puis décision admin (étape 2/2) ; un refus est
// une voie terminale (barre vide, comme « Clôturé » côté dossiers).
const LIBELLES_PAIEMENT: Record<string, string> = {
  PENDING_VIREMENT: "En attente de décision",
  PAID: "Validé",
  REFUSED: "Décision rendue",
  REFUND_DUE: "Remboursement à faire",
  REFUNDED: "Remboursé",
};

export function AvancementPaiement({
  status,
  variante = "complet",
}: { status: string; variante?: Variante }) {
  if (status === "PENDING_VIREMENT") {
    if (variante === "badge") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
          <div className="flex gap-0.5">
            <div className="h-1.5 w-2.5 rounded bg-amber-500" />
            <div className="h-1.5 w-2.5 rounded bg-zinc-200" />
          </div>
          <span>Étape 1 / 2 — {LIBELLES_PAIEMENT.PENDING_VIREMENT}</span>
        </span>
      );
    }
    if (variante === "compact") {
      return (
        <div className="flex items-center gap-2">
          <Barre courant={0} total={2} />
          <span className="text-[11px] font-medium text-zinc-500 whitespace-nowrap">
            {LIBELLES_PAIEMENT.PENDING_VIREMENT}
          </span>
        </div>
      );
    }
  return (
    <div className="flex flex-col gap-1">
      <Barre courant={0} total={2} />
      <span className="text-[11px] font-medium text-zinc-500">
        Étape 1 / 2 — {LIBELLES_PAIEMENT.PENDING_VIREMENT}
      </span>
    </div>
  );
  }

  if (status === "PAID") {
    if (variante === "badge") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800">
          <div className="flex gap-0.5">
            <div className="h-1.5 w-2.5 rounded bg-emerald-500" />
            <div className="h-1.5 w-2.5 rounded bg-emerald-500" />
          </div>
          <span>Étape 2 / 2 — {LIBELLES_PAIEMENT.PAID}</span>
        </span>
      );
    }
    if (variante === "compact") {
      return (
        <div className="flex items-center gap-2">
          <Barre courant={2} total={2} />
          <span className="text-[11px] font-medium text-zinc-500 whitespace-nowrap">
            {LIBELLES_PAIEMENT.PAID}
          </span>
        </div>
      );
    }
  return (
    <div className="flex flex-col gap-1">
      <Barre courant={2} total={2} />
      <span className="text-[11px] font-medium text-zinc-500">
        Étape 2 / 2 — {LIBELLES_PAIEMENT.PAID}
      </span>
    </div>
  );
  }

  // REFUSED, REFUND_DUE, REFUNDED = voies terminales
  if (variante === "badge") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-500">
        <span className="h-1.5 w-8 overflow-hidden rounded-full bg-zinc-200" />
        {LIBELLES_PAIEMENT[status] ?? "Décision rendue"}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100" />
      <span className="text-[11px] font-medium text-zinc-500">
        {LIBELLES_PAIEMENT[status] ?? "Décision rendue"}
      </span>
    </div>
  );
}
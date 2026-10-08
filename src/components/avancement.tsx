// Barres d'étape « État d'avancement » — même visual pour le suivi des
// dossiers (pipeline de 8 étapes) et pour les paiements (dépôt → décision).
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

export function Avancement({ statut }: { statut: string }) {
  if (TERMINAL.has(statut)) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100" />
        <span className="text-[11px] font-medium text-zinc-500">
          Clôturé
        </span>
      </div>
    );
  }
  const { courant, total } = etapeIndexes(statut);
  return (
    <div className="flex flex-col gap-1">
      <Barre courant={courant} total={total} />
      <span className="text-[11px] font-medium text-zinc-500">
        Étape {courant + 1} / {total} — {LIBELLES_PIERRE[courant]}
      </span>
    </div>
  );
}

// Paiement : dépôt (étape 1/2) puis décision admin (étape 2/2) ; un refus est
// une voie terminale (barre vide, comme « Clôturé » côté dossiers).
const LIBELLES_PAIEMENT: Record<string, string> = {
  PENDING_VIREMENT: "En attente de décision",
  PAID: "Validé",
  REFUSED: "Décision rendue",
};

export function AvancementPaiement({ status }: { status: string }) {
  if (status === "PENDING_VIREMENT") {
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
    return (
      <div className="flex flex-col gap-1">
        <Barre courant={2} total={2} />
        <span className="text-[11px] font-medium text-zinc-500">
          Étape 2 / 2 — {LIBELLES_PAIEMENT.PAID}
        </span>
      </div>
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

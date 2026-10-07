/**
 * Délais procéduraux — calculs de dates (module pur, sans `server-only`).
 *
 * - **Jours francs** : le jour de l'acte (PV, notification) n'est pas compté —
 *   le délai court à compter du lendemain (`ajouterJoursFrances`).
 * - **Jour ouvrable** : si un délai expire un samedi, un dimanche ou un jour
 *   férié, il est reporté au premier jour ouvrable suivant
 *   (`reporterJourOuvrable` — art. R. 123-1 du code de justice administrative).
 * - **Forclusion 48SI** : l'invalidation du permis pour solde de points nul se
 *   conteste dans les 2 mois (60 jours francs) à compter de la notification
 *   (`controlerForclusion48si`) — signal renvoyé tel quel à l'UI, jamais
 *   bloquant côté client, bandeau bloquant côté juriste.
 *
 * Fériés : métropole uniquement (pas d'Outre-mer, pas d'Alsace-Moselle).
 */

const UTC = 24 * 3600 * 1000;

/** Dimanche de Pâques (algorithme de Meeus/Butcher) en UTC. */
function dimanchePaques(annee: number): Date {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(annee, mois - 1, jour));
}

/** Fériés fixes (mois 0-11, jour), hors fériés mobiles de Pâques. */
const FERIES_FIXES: Array<[number, number]> = [
  [0, 1], // 1er janvier
  [4, 1], // 1er mai
  [4, 8], // 8 mai
  [6, 14], // 14 juillet
  [7, 15], // 15 août
  [10, 1], // 1er novembre
  [10, 11], // 11 novembre
  [11, 25], // Noël
];

/** Un jour férié (métropole) ? */
export function estJourFerie(date: Date): boolean {
  const mois = date.getUTCMonth();
  const jour = date.getUTCDate();
  if (FERIES_FIXES.some(([m, j]) => m === mois && j === jour)) return true;
  const paques = dimanchePaques(date.getUTCFullYear());
  const decale = (n: number) => new Date(paques.getTime() + n * UTC);
  const lundiPaques = decale(1);
  const ascension = decale(39);
  const lundiPentecote = decale(50);
  return [lundiPaques, ascension, lundiPentecote].some(
    (f) => f.getUTCMonth() === mois && f.getUTCDate() === jour,
  );
}

/** Jour ouvrable : lundi→vendredi, hors jour férié. */
export function estJourOuvrable(date: Date): boolean {
  const j = date.getUTCDay();
  if (j === 0 || j === 6) return false;
  return !estJourFerie(date);
}

/**
 * Ajoute `jours` jours francs à une date : le jour de départ n'est pas compté
 * (le lendemain de l'acte est le jour 1). Accepte `YYYY-MM-DD` (interprété en
 * UTC) ou un `Date`.
 */
export function ajouterJoursFrances(
  dateDepart: Date | string,
  jours: number,
): Date {
  const d =
    typeof dateDepart === "string"
      ? new Date(`${dateDepart.slice(0, 10)}T00:00:00Z`)
      : new Date(
          Date.UTC(
            dateDepart.getUTCFullYear(),
            dateDepart.getUTCMonth(),
            dateDepart.getUTCDate(),
          ),
        );
  if (Number.isNaN(d.getTime())) return d;
  return new Date(d.getTime() + jours * UTC);
}

/**
 * Reporte une date d'échéance qui tombe un samedi, un dimanche ou un jour
 * férié jusqu'au premier jour ouvrable suivant. Une date déjà ouvrable est
 * retournée telle quelle.
 */
export function reporterJourOuvrable(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  let garde = 0;
  while (!estJourOuvrable(d) && garde < 30) {
    d.setTime(d.getTime() + UTC);
    garde += 1;
  }
  return d;
}

export type Forclusion48si = {
  /** Dernier jour possible pour agir (reporté au prochain jour ouvrable). */
  dateForclusion: Date;
  /** L'action est-elle engagée après la forclusion ? */
  depasse: boolean;
  /** Jours de dépassement (0 si dans les délais). */
  joursDepasse: number;
};

/**
 * Contrôle de forclusion du recours contre une invalidation 48SI : 60 jours
 * francs à compter de la notification. Renvoie `null` si la date de
 * notification est absente ou invalide (jamais de signal fabriqué).
 */
export function controlerForclusion48si(
  dateNotification?: string | Date | null,
  dateAction?: Date | null,
): Forclusion48si | null {
  if (!dateNotification) return null;
  const notif = ajouterJoursFrances(dateNotification, 0);
  if (Number.isNaN(notif.getTime())) return null;
  const forclusion = reporterJourOuvrable(ajouterJoursFrances(notif, 60));
  const action = dateAction ?? new Date();
  const jourAction = Math.floor(
    Date.UTC(action.getUTCFullYear(), action.getUTCMonth(), action.getUTCDate()) /
      UTC,
  );
  const jourForclusion = Math.floor(forclusion.getTime() / UTC);
  const joursDepasse = Math.max(0, jourAction - jourForclusion);
  return { dateForclusion: forclusion, depasse: joursDepasse > 0, joursDepasse };
}

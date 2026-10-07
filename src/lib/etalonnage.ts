import { prisma } from "@/lib/prisma";
import { rechercherRadar } from "@/lib/preuves-api";
import { echeanceVerificationRadar, type ExtractedData } from "@/lib/moteur";

export type ContexteEtalonnage = {
  /** Échéance du certificat au jour du PV — alimente la règle `etalonnageExpire`. */
  dateExpiration: Date | null;
  /** URL du certificat saisie par l'admin (registre) — absente sur une détection depuis le PV. */
  preuveUrl: string | null;
};

/**
 * Preuve d'entretien du radar : échéance du certificat d'étalonnage, par
 * ordre de fiabilité —
 * 1. registre admin `RadarCalibration` (saisie humaine, prioritaire) ;
 * 2. à défaut, la date de vérification **lue sur le PV** (`dateVerificationAppareil`,
 *    rubrique « Appareil de contrôle homologué ») : +1 an (ou +2 ans selon la
 *    date d'installation de la liste officielle, best-effort).
 *
 * Garde-fous : une date de vérification **postérieure** au PV est ignorée
 * (incohérente — jamais de contexte fabriqué) ; best-effort total (régistre
 * ou liste radars injoignables → pas de contexte, jamais d'exception).
 */
export async function contexteEtalonnage(
  data: ExtractedData,
): Promise<ContexteEtalonnage> {
  try {
    if (data.radarId) {
      const cal = await prisma.radarCalibration.findFirst({
        where: { radarId: data.radarId },
        orderBy: { dateExpiration: "desc" },
      });
      if (cal) {
        return { dateExpiration: cal.dateExpiration, preuveUrl: cal.preuveUrl };
      }
    }

    const verif = data.dateVerificationAppareil;
    if (!verif) return { dateExpiration: null, preuveUrl: null };
    if (data.date && verif > data.date) {
      return { dateExpiration: null, preuveUrl: null };
    }

    let dateInstallation: string | undefined;
    if (data.radarId) {
      const fiche = await rechercherRadar({ radarId: data.radarId }).catch(
        () => null,
      );
      dateInstallation = fiche?.dateInstallation || undefined;
    }
    return {
      dateExpiration: echeanceVerificationRadar(verif, dateInstallation),
      preuveUrl: null,
    };
  } catch {
    return { dateExpiration: null, preuveUrl: null };
  }
}

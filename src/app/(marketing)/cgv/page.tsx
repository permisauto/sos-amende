import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Conditions générales de vente",
};

export default function CgvPage() {
  return (
    <LegalPage title="Conditions générales de vente" updatedAt="13 août 2026">
      <h2 className="text-lg font-semibold text-zinc-900">1. Objet</h2>
      <p>
        SOS Amende (ci-après « le Service ») est un service en ligne d'aide à
        la contestation des amendes routières et à la défense du permis de
        conduire. Le Service fournit des outils de saisie, d'analyse, de
        génération de courriers et de suivi des procédures. Il n'est pas un
        cabinet d'avocats et ne fournit pas de consultation juridique au sens
        de la loi n° 71-1130 du 31 décembre 1971.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">2. Offres</h2>
      <p>
        Le Service propose une analyse gratuite, un abonnement mensuel et des
        prestations à l'acte. Les prix sont indiqués en euros, TTC. L'offre
        gratuite permet une analyse préliminaire sans engagement. La
        génération des courriers et le suivi sont réservés aux offres payantes.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">3. Limites de responsabilité</h2>
      <p>
        Le Service se limite aux cas dans lesquels l'usager peut agir lui-même
        sans représentation obligatoire par un avocat. Pour les autres cas
        (contraventions des 4e et 5e classes, délits), le Service oriente vers
        un avocat partenaire. Le Service ne garantit pas le succès d'une
        contestation ou d'un recours. L'utilisateur reste responsable de la
        vérification des informations saisies et de l'envoi des courriers dans
        les délais légaux.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">4. Délais légaux</h2>
      <p>
        Il appartient à l'utilisateur de respecter les délais légaux de
        contestation (45 jours pour l'amende hors forfait) et de recours. Les
        rappels du Service sont une aide, non une garantie de la validité de
        l'envoi.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">5. Résiliation et remboursement</h2>
      <p>
        L'abonnement est résiliable à tout moment depuis le portail client.
        Conformément aux articles L.221-18 et suivants du Code de la
        consommation, le droit de rétractation de 14 jours ne s'applique pas
        aux services numériques pleinement exécutés avant son expiration.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">6. Droit applicable</h2>
      <p>
        Les présentes CGV sont soumises au droit français. Tout litige relève
        des tribunaux français compétents, sous réserve d'une médiation
        préalable de la consommation.
      </p>
    </LegalPage>
  );
}

import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
};

export default function ConfidentialitePage() {
  return (
    <LegalPage title="Politique de confidentialité" updatedAt="13 août 2026">
      <h2 className="text-lg font-semibold text-zinc-900">1. Responsable de traitement</h2>
      <p>
        SOS Amende agit en qualité de responsable de traitement des données
        personnelles collectées dans le cadre du Service, conformément au
        Règlement (UE) 2016/679 (« RGPD ») et à la loi Informatique et
        Libertés.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">2. Données collectées</h2>
      <p>
        Le Service collecte les données strictement nécessaires : identité et
        coordonnées (nom, e-mail), données relatives aux véhicules et au
        permis de conduire, ainsi que les pièces transmises pour la
        contestation (avis de contravention, courriers). Ces données revêtent
        un caractère sensible et font l'objet de mesures de sécurité
        renforcées.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">3. Finalités</h2>
      <p>
        Les données sont utilisées pour la gestion des dossiers, la
        génération des courriers, le suivi des délais, la facturation et
        l'amélioration du Service. Elles ne sont jamais revendues.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">4. Conservation</h2>
      <p>
        Les dossiers sont conservés pendant la durée de la procédure et, à
        titre d'archivage, trois ans après la clôture. Les données de
        facturation sont conservées conformément aux obligations comptables.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">5. Vos droits</h2>
      <p>
        Vous disposez d'un droit d'accès, de rectification, d'effacement, de
        limitation, d'opposition et de portabilité de vos données, ainsi que
        d'un droit de définir des directives post-mortem. Vous pouvez les
        exercer à tout moment à l'adresse dpo@sosamende.fr. Vous disposez
        également d'un droit de réclamation auprès de la CNIL.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">6. Sous-traitants</h2>
      <p>
        Certaines données sont traitées par des sous-traitants (hébergement,
        paiement, envoi d'e-mails) situés dans l'Union européenne ou
        bénéficiant des garanties prévues par le RGPD.
      </p>
    </LegalPage>
  );
}

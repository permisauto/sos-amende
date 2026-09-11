import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
};

export default function ConfidentialitePage() {
  return (
    <LegalPage title="Politique de confidentialité" updatedAt="11 septembre 2026">
      <h2 className="text-lg font-semibold text-zinc-900">1. Responsable du traitement</h2>
      <p>
        SOS Amende est un service édité par DIXIT LLC (30 N Gould St, Ste R,
        Sheridan, WY 82801, États-Unis), qui agit en qualité de responsable de
        traitement des données personnelles collectées dans le cadre du Service,
        conformément au Règlement (UE) 2016/679 (« RGPD ») et à la loi
        Informatique et Libertés.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">2. Données collectées</h2>
      <p>
        Le Service collecte les données strictement nécessaires au traitement des
        Dossiers : identité et coordonnées (nom, prénom, e-mail, adresse),
        numéro de téléphone (facultatif), le contenu de l'avis de contravention ou
        de la décision transmis (numéro de PV, plaque d'immatriculation, date,
        montant), les pièces jointes versées au Dossier, ainsi que les données de
        paiement (traitées par le prestataire de paiement, jamais conservées par
        SOS Amende).
      </p>
      <p>
        Ces données revêtent un caractère sensible et font l'objet de mesures de
        sécurité renforcées (chiffrement des échanges, accès restreint aux
        équipes autorisées).
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">3. Finalités de la collecte</h2>
      <p>
        Vos données sont utilisées pour : la gestion et le suivi de vos Dossiers,
        la génération des courriers, le calcul des délais légaux de contestation,
        la facturation, la lutte contre la fraude, et l'amélioration du Service.
        Elles ne sont jamais revendues ni cédées à des tiers à des fins
        commerciales. Une demande de mise en relation avec un avocat partenaire
        n'implique la transmission de vos coordonnées qu'avec votre accord
        explicite.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">4. Conservation des données</h2>
      <p className="font-medium">Vos données sont conservées pendant les durées suivantes :</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Données d'identification : 3 ans à compter de la dernière connexion ;</li>
        <li>Dossiers : pendant la durée de la procédure, puis 3 ans à titre d'archivage après la clôture ;</li>
        <li>Preuves de paiement et pièces comptables : 10 ans (obligations comptables et fiscales) ;</li>
        <li>Journaux de connexion (logs) : 1 an ;</li>
        <li>Cookies : 13 mois maximum.</li>
      </ul>
      <p>
        À l'issue de ces durées, les données sont, si nécessaire, archivées dans
        la limite des délais de prescription légale, puis détruites.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">5. Vos droits</h2>
      <p>
        Vous disposez d'un droit d'accès, de rectification, d'effacement, de
        limitation, d'opposition et de portabilité de vos données, ainsi que du
        droit de définir des directives post-mortem. Vous pouvez les exercer à
        tout moment à l'adresse <span className="font-medium">dpo@recours-permis-pv.com</span>{" "}
        en joignant toute pièce justifiant votre identité. Vous disposez
        également d'un droit de réclamation auprès de la CNIL.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">6. Sous-traitants</h2>
      <p>
        Certaines données sont traitées par des sous-traitants, dans les stricts
        besoins de leur mission :
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Hébergement du service : Hostinger ;</li>
        <li>Paiement par carte : Stripe ;</li>
        <li>Envoi des e-mails (liens de connexion, notifications) : Resend ;</li>
        <li>Fichiers des pièces (PV, signatures, PDF) : stockage sécurisé local ou S3-compatible.</li>
      </ul>
      <p>
        Conformément au RGPD, ces sous-traitants font l'objet d'accords encadrant
        le traitement des données et respectent les garanties prévues par le
        règlement.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">7. Délégué à la protection des données</h2>
      <p>
        Pour toute information complémentaire relative à l'utilisation de vos
        données, vous pouvez contacter notre délégué à la protection des données
        (DPO) à l'adresse <span className="font-medium">dpo@recours-permis-pv.com</span>.
        En cas de difficulté non résolue, vous pouvez saisir la CNIL.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">8. Cookies</h2>
      <p>
        Les cookies sont de petits fichiers qu'un site peut enregistrer sur votre
        terminal (ordinateur, tablette, smartphone). Le Service utilise
        uniquement des cookies techniques strictement nécessaires au
        fonctionnement (session, sécurité) et, le cas échéant, des cookies de
        mesure d'audience anonymisés. Aucun cookie publicitaire ni traceur de
        réseaux sociaux n'est déposé.
      </p>
      <p>
        Vous pouvez modifier les paramètres de votre navigateur pour refuser les
        cookies ; certaines fonctionnalités du Service pourraient alors ne pas
        fonctionner normalement.
      </p>
    </LegalPage>
  );
}
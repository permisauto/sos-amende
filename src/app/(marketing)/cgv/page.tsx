import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Conditions générales de vente",
};

export default function CgvPage() {
  return (
    <LegalPage title="Conditions générales de vente" updatedAt="11 septembre 2026">
      <h2 className="text-lg font-semibold text-zinc-900">Article 1. Champ d'application</h2>
      <p>
        Les présentes conditions générales de vente (« CGV ») régissent toutes
        les commandes d'un ou plusieurs services (les « Services ») proposés sur
        le site internet recours-permis-pv.com (le « Site ») par DIXIT LLC,
        société immatriculée dans l'État du Wyoming (États-Unis), dont le siège
        social est situé 30 N Gould St, Ste R, Sheridan, WY 82801, États-Unis
        (ci-après « SOS Amende »).
      </p>
      <p>
        Le fait de passer commande d'un Service implique l'adhésion entière et
        sans réserve du Client aux présentes CGV.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 2. Définitions</h2>
      <p>
        <strong>Client</strong> : toute personne physique ou morale passant
        commande d'un Service sur le Site.
      </p>
      <p>
        <strong>Commande</strong> : action pour le Client d'accepter les
        présentes CGV, de régler le prix du Service puis de téléverser un avis de
        contravention ou une décision de suspension.
      </p>
      <p>
        <strong>Dossier</strong> : ensemble des éléments transmis et traités dans
        le cadre du Service (avis de contravention, décision, données extraites,
        lettre générée, preuves).
      </p>
      <p>
        <strong>Service</strong> : outil d'aide à la contestation décrit à
        l'article 3.
      </p>
      <p>
        <strong>Site</strong> : le site internet recours-permis-pv.com édité par
        DIXIT LLC.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 3. Description du Service</h2>
      <p>
        SOS Amende met à la disposition du Client un outil en ligne « en mode
        rien droit », qui lui permet de préparer lui-même la contestation d'une
        amende forfaitaire (requête en exonération) ou d'une décision de
        rétention ou d'invalidation du permis. Le Service se déroule comme suit :
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Paiement du Service par le Client (inscription inversée) ;</li>
        <li>
          Téléversement de l'avis de contravention ou de la décision, lecture
          automatique (OCR) avec relecture humaine obligatoire par le Client ;
        </li>
        <li>
          Détection d'une faille juridique par le moteur, à partir d'une base
          de fondements préalablement validés ;
        </li>
        <li>Génération d'une lettre que le Client valide et signe ;</li>
        <li>
          Validation de la lettre par un juriste partenaire ;
        </li>
        <li>
          Préparation du kit d'envoi en recommandé avec accusé de réception
          (LRAR) — l'envoi est effectué par le Client lui-même ;
        </li>
        <li>
          Suivi du dossier jusqu'à la décision (acceptation ou rejet) et rappels
          des échéances.
        </li>
      </ul>
      <p>
        Le Service n'est pas une prestation d'avocat et n'inclut aucune
        représentation en justice, aucun recours ni aucune instance devant un
        tribunal. SOS Amende n'est pas un cabinet d'avocats et ne fournit pas de
        consultation juridique au sens de la loi n° 71-1130 du 31 décembre 1971.
        Le Client reste libre d'envoyer la lettre générée ou de contester
        directement auprès des autorités compétentes.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 4. Commande et paiement</h2>
      <p>
        La Commande est effectuée en ligne. Elle fait l'objet d'une confirmation
        par courrier électronique, à l'adresse indiquée par le Client.
      </p>
      <p>
        Le paiement s'effectue par carte bancaire (Stripe) ou par virement
        bancaire. Les informations bancaires du Client ne sont pas conservées par
        SOS Amende : elles sont traitées par le prestataire de paiement.
      </p>
      <p>
        Le crédit acheté est porté au compte du Client et consommé à l'ouverture
        d'un Dossier. En cas de rejet du dossier par le juriste partenaire, le
        crédit est rendu au Client et peut être réutilisé.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 5. Prix</h2>
      <p>
        Le prix du Service est de <strong>39 €</strong> TTC pour la contestation
        d'une amende forfaitaire et de <strong>59 €</strong> TTC pour le
        traitement d'une décision de suspension ou d'invalidation du permis.
      </p>
      <p>
        Les prix sont indiqués en euros, toutes taxes comprises. Le Service étant
        exécuté de manière immédiate (analyse, génération et validation de la
        lettre), le Client reconnaît, conformément à l'article L.221-28 du Code
        de la consommation, renoncer expressément à l'exercice de son droit de
        rétractation, la prestation de service numérique étant pleinement
        exécutée avant la fin du délai de rétractation.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 6. Obligations du Client</h2>
      <p>
        Le Client s'engage à fournir des informations exactes et complètes, à
        relire les informations extraites par l'OCR avant de les valider
        (relecture humaine obligatoire) et à vérifier le bien-fondé de la lettre
        générée avant de la signer.
      </p>
      <p>
        Il appartient au Client de respecter les délais légaux de contestation
        (45 jours pour l'amende forfaitaire, 2 mois pour le recours gracieux
        d'une décision de suspension) et d'expédier la lettre en LRAR dans les
        délais. Les rappels de SOS Amende sont une aide, et non une garantie de
        l'expédition.
      </p>
      <p>
        Le Client reste seul responsable de l'envoi de la lettre et de la
        vérification des informations saisies.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 7. Responsabilité</h2>
      <p>
        SOS Amende s'engage à mettre en œuvre un outil conforme aux textes en
        vigueur et à n'utiliser que des fondements juridiques préalablement
        validés. Le Service ne garantit pas le succès d'une contestation : la
        décision appartient aux autorités compétentes (officier du ministère
        public, préfet, juridiction).
      </p>
      <p>
        SOS Amende ne saurait être tenue responsable en cas de rejet d'une
        contestation pour un motif étranger à l'exécution du présent contrat
        (absence de consignation, non-respect des délais, vice de forme imputable
        au Client, désistement). Le Service peut être interrompu momentanément
        pour des raisons de maintenance, sans que cette interruption engage sa
        responsabilité.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 8. Propriété intellectuelle</h2>
      <p>
        L'utilisation du Site ne confère aucun droit. L'ensemble des contenus du
        Site (textes, modèles, base de fondements juridiques, logiciels) reste la
        propriété exclusive de DIXIT LLC et ne peut être reproduit, diffusé ou
        commercialisé sans accord écrit préalable.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 9. Données personnelles</h2>
      <p>
        Les données personnelles du Client sont traitées conformément au
        Règlement (UE) 2016/679 (RGPD) et à la loi Informatique et Libertés.
        Le Client dispose d'un droit d'accès, de rectification, d'effacement,
        de limitation, d'opposition et de portabilité, exerçable à l'adresse
        <span className="font-medium"> dpo@recours-permis-pv.com</span>, ainsi
        que d'un droit de réclamation auprès de la CNIL. Les détails du
        traitement figurent dans la politique de confidentialité du Site.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 10. Force majeure</h2>
      <p>
        SOS Amende ne saurait être tenue responsable en cas d'inexécution de ses
        engagements due à un cas de force majeure (catastrophes naturelles,
        émeutes, guerres, épidémies, dysfonctionnement des télécommunications).
        Dans cette hypothèse, le Client en est informé ainsi que des mesures
        prises pour y remédier.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 11. Droit applicable</h2>
      <p>
        Les présentes CGV sont soumises au droit français. En cas de litige, le
        Client peut recourir gratuitement à un médiateur de la consommation dans
        un délai d'un an à compter de sa réclamation écrite. À défaut de
        résolution amiable, tout litige relève des tribunaux compétents.
      </p>
    </LegalPage>
  );
}
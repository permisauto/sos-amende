import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { PRIX_AMENDE, PRIX_CONTENTIEUX, PRIX_SUSPENSION, PRIX_OPTION_LRAR } from "@/lib/tarifs";

export const metadata: Metadata = {
  title: "Conditions générales de vente",
};

export default function CgvPage() {
  return (
    <LegalPage title="Conditions générales de vente" updatedAt="9 novembre 2026">
      <h2 className="text-lg font-semibold text-zinc-900">Article 1. Champ d&apos;application et identification du vendeur</h2>
      <p>
        Les présentes conditions générales de vente (« CGV ») régissent toutes
        les commandes d&apos;un ou plusieurs services (les « Services ») proposés sur
        le site internet recours-permis-pv.com (le « Site ») par DIXIT LLC,
        société à responsabilité limitée immatriculée dans l&apos;État du Wyoming
        (États-Unis) sous le numéro 2026-002016662, dont le siège social est
        situé 30 N Gould St, Ste N, Sheridan, WY 82801, États-Unis (ci-après
        « SOS Amende »). Les coordonnées complètes de l&apos;éditeur figurent dans
        les mentions légales du Site. Contact : contact@recours-permis-pv.com.
      </p>
      <p>
        Les CGV sont accessibles sur le Site avant toute commande. Le fait de
        passer commande implique l&apos;acceptation entière et sans réserve des
        présentes CGV dans leur version en vigueur au jour de la commande.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 2. Définitions</h2>
      <p>
        <strong>Client</strong> : toute personne physique ou morale passant
        commande d&apos;un Service sur le Site.
      </p>
      <p>
        <strong>Consommateur</strong> : toute personne physique qui agit à des
        fins qui n&apos;entrent pas dans le cadre de son activité commerciale,
        industrielle, artisanale, libérale ou agricole.
      </p>
      <p>
        <strong>Commande</strong> : action pour le Client d&apos;accepter les
        présentes CGV, de valider son choix de Service et de confirmer sa
        commande avec obligation de paiement.
      </p>
      <p>
        <strong>Dossier</strong> : ensemble des éléments transmis et traités dans
        le cadre du Service (avis de contravention, décision, données extraites,
        lettre générée, pièces justificatives).
      </p>
      <p>
        <strong>Service</strong> : outil d&apos;aide à la contestation décrit à
        l&apos;article 3.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 3. Description du Service</h2>
      <p>
        SOS Amende met à la disposition du Client un outil en ligne d&apos;aide à la
        préparation de la contestation d&apos;une amende forfaitaire (requête en
        exonération) ou d&apos;une décision de rétention, de suspension ou
        d&apos;invalidation du permis de conduire. Le Service se déroule comme suit :
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Commande et paiement du Service par le Client ;</li>
        <li>
          Téléversement de l&apos;avis de contravention ou de la décision, lecture
          automatique (OCR) suivie d&apos;une relecture et d&apos;une correction
          obligatoires par le Client ;
        </li>
        <li>
          Détection de fondements juridiques par le moteur, à partir d&apos;une base
          de fondements préalablement validés ;
        </li>
        <li>Génération d&apos;une lettre que le Client relit, valide et signe ;</li>
        <li>Validation de la lettre par un juriste partenaire ;</li>
        <li>
          Transmission de la contestation : soit par lettre recommandée avec
          accusé de réception (option payante) ; soit par dépôt assisté sur le
          portail officiel, SOS Amende fournissant au Client le lien et les
          pièces nécessaires ;
        </li>
        <li>
          Suivi du Dossier jusqu&apos;à la décision (acceptation ou rejet) et rappels
          des échéances.
        </li>
      </ul>
      <p>
        Le Service n&apos;est pas une prestation d&apos;avocat et n&apos;inclut aucune
        représentation en justice, aucun recours ni aucune instance devant un
        tribunal. SOS Amende n&apos;est pas un cabinet d&apos;avocats. Le Client reste
        libre d&apos;envoyer la lettre générée ou de contester directement auprès des
        autorités compétentes.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 4. Commande et paiement</h2>
      <p>
        La Commande est effectuée en ligne. Avant de la confirmer, le Client
        peut vérifier le détail de sa Commande et le prix total et corriger
        d&apos;éventuelles erreurs. La confirmation de la Commande se fait par un
        bouton portant la mention « Commande avec obligation de paiement »
        (ou une formule équivalente). Elle fait l&apos;objet d&apos;un accusé de
        réception par courrier électronique, à l&apos;adresse indiquée par le Client.
      </p>
      <p>
        Le paiement s&apos;effectue par virement bancaire. Les coordonnées du compte
        bénéficiaire (RIB) sont communiquées au Client au moment de la
        finalisation du Dossier ; le Client effectue lui-même le virement depuis
        son établissement bancaire. Le paiement par carte bancaire est en cours
        de déploiement et sera proposé ultérieurement.
      </p>
      <p>
        Le crédit acheté est porté au compte du Client et consommé à l&apos;ouverture
        d&apos;un Dossier. En cas de rejet du Dossier par le juriste partenaire, le
        crédit est rendu au Client et peut être réutilisé. Pour un Dossier
        relevant du contentieux contraventionnel, le paiement est rattaché au
        Dossier (aucun crédit générique) et remboursé en cas de rejet.
      </p>
      <p>
        Tout remboursement dû au Client est effectué par virement dans un délai
        maximal de quatorze (14) jours à compter de la décision qui l&apos;ouvre.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 4 bis. Délits</h2>
      <p>
        Les faits qualifiés de délit (notamment convocation devant le tribunal
        correctionnel, amende forfaitaire délictuelle, conduite sans permis ou
        sans assurance) ne relèvent pas du Service : ils exigent l&apos;assistance
        d&apos;un avocat. SOS Amende oriente alors le Client vers un avocat
        partenaire. <strong>Aucun paiement n&apos;est débité</strong> pour un tel
        dossier.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 4 ter. Consignation</h2>
      <p>
        Pour les contraventions de 4e et 5e classe, la contestation suppose une
        consignation préalable du montant de l&apos;amende, versée par le Client
        directement à l&apos;administration. Cette somme ne constitue pas un
        paiement du Service et n&apos;est jamais encaissée par SOS Amende ; elle
        est restituée au Client si la contestation aboutit.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 5. Prix</h2>
      <p>
        Le prix du Service est de <strong>{PRIX_AMENDE} €</strong> TTC pour la
        contestation d&apos;amende forfaitaire, de{" "}
        <strong>{PRIX_CONTENTIEUX} €</strong> TTC pour le contentieux
        contraventionnel (4e/5e classe, hors consignation) et de{" "}
        <strong>{PRIX_SUSPENSION} €</strong> TTC pour le traitement d&apos;une
        décision de suspension ou d&apos;invalidation du permis.
      </p>
      <p>
        Le Client peut souscrire, en complément du tarif de base, une{" "}
        <strong>option d&apos;envoi en lettre recommandée avec accusé de réception</strong>{" "}
        facturée <strong>{PRIX_OPTION_LRAR} €</strong> TTC, qui s&apos;ajoute au
        tarif de base correspondant. À défaut, la contestation est transmise
        par dépôt assisté sur le portail officiel.
      </p>
      <p>
        Les prix sont indiqués en euros, toutes taxes comprises. Le prix
        applicable est celui affiché sur le Site au moment de la Commande.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 6. Exécution du Service</h2>
      <p>
        Le Service est exécuté de manière immédiate dès la Commande : analyse du
        Dossier, génération de la lettre, validation par le juriste partenaire et
        mise à disposition de la lettre validée au Client. Les délais de
        traitement dépendent notamment de la rapidité avec laquelle le Client
        fournit des pièces exactes et complètes et relit ses informations.
      </p>
      <p>
        Le Service est considéré comme pleinement exécuté lorsque la lettre
        validée par le juriste a été mise à disposition du Client. La
        transmission de la contestation (lettre recommandée ou dépôt assisté) et
        le suivi du Dossier sont des prestations complémentaires qui suivent
        cette mise à disposition.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 7. Droit de rétractation</h2>
      <p>
        Le Client Consommateur dispose, conformément à l&apos;article L. 221-18 du
        Code de la consommation, d&apos;un délai de quatorze (14) jours à compter de
        la conclusion du contrat pour se rétracter, sans avoir à justifier de
        motif ni à supporter de pénalités. Ce droit ne s&apos;applique pas aux
        Clients qui ne sont pas des Consommateurs.
      </p>
      <p>
        <strong>Exécution immédiate du Service.</strong> Le Service étant
        exécuté de manière immédiate, le Client demande expressément, au moment
        de la Commande et avant le paiement, que l&apos;exécution du Service commence
        avant la fin du délai de rétractation. Il reconnaît qu&apos;il perdra son
        droit de rétractation dès que le Service aura été pleinement exécuté
        (articles L. 221-25 et L. 221-28 du Code de la consommation). Cette
        demande et cette reconnaissance sont matérialisées par une case à cocher
        obligatoire, dont SOS Amende conserve la trace (date, heure, Client et
        texte accepté). Sans cette case cochée, la Commande ne peut pas être
        validée.
      </p>
      <p>
        <strong>Rétractation avant la pleine exécution.</strong> Si le Client se
        rétracte avant que le Service ait été pleinement exécuté, il règle un
        montant proportionné à ce qui lui a été fourni jusqu&apos;à la communication
        de sa décision de se rétracter, par rapport à l&apos;ensemble des prestations
        prévues au contrat. Le surplus éventuellement versé lui est remboursé
        dans les conditions de l&apos;article 4.
      </p>
      <p>
        <strong>Comment se rétracter.</strong> Le Client informe SOS Amende de
        sa décision de se rétracter par une déclaration dénuée d&apos;ambiguïté
        envoyée à contact@recours-permis-pv.com, en utilisant s&apos;il le souhaite le
        modèle de formulaire ci-dessous. Il suffit que la communication relative
        à l&apos;exercice du droit de rétractation soit transmise avant l&apos;expiration
        du délai.
      </p>
      <p>
        <em>Modèle de formulaire de rétractation</em> (à compléter et renvoyer
        uniquement si vous souhaitez vous rétracter) : « À l&apos;attention de
        DIXIT LLC (SOS Amende), contact@recours-permis-pv.com. Je vous notifie
        par la présente ma rétractation du contrat portant sur le Service
        suivant : [désignation du Service]. Commandé le : [date]. Nom du
        Client : [nom]. Adresse du Client : [adresse]. Date : [date]. Signature
        (uniquement en cas de notification sur papier). »
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 8. Obligations du Client</h2>
      <p>
        Le Client s&apos;engage à fournir des informations exactes et complètes, à
        relire et corriger les informations extraites par l&apos;OCR avant de les
        valider, et à vérifier le contenu de la lettre générée avant de la
        signer.
      </p>
      <p>
        Il appartient au Client de respecter les délais légaux qui s&apos;appliquent
        à sa situation. Les délais et les rappels indiqués par SOS Amende dans le
        Dossier sont fournis à titre indicatif, sur la base des informations
        saisies par le Client, et ne constituent pas une garantie de recevabilité
        de la contestation ni de son expédition dans le délai.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 9. Responsabilité et garanties légales</h2>
      <p>
        SOS Amende s&apos;engage à mettre en œuvre un outil conforme aux textes en
        vigueur et à n&apos;utiliser que des fondements juridiques préalablement
        validés. Le Service ne garantit pas le succès d&apos;une contestation : la
        décision appartient aux autorités compétentes (officier du ministère
        public, préfet, juridiction).
      </p>
      <p>
        SOS Amende ne saurait être tenue responsable du rejet d&apos;une contestation
        pour un motif étranger à l&apos;exécution du présent contrat (absence de
        consignation, non-respect des délais par le Client, informations
        inexactes fournies par le Client, désistement). Le Service peut être
        interrompu momentanément pour maintenance, sans que cette interruption
        n&apos;engage sa responsabilité lorsqu&apos;elle est raisonnable et temporaire.
      </p>
      <p>
        Aucune stipulation des présentes CGV ne limite ni n&apos;exclut les garanties
        légales dont bénéficie le Client Consommateur, notamment la garantie
        légale de conformité applicable aux services numériques (articles
        L. 224-25-1 et suivants du Code de la consommation), ni sa responsabilité
        lorsqu&apos;elle ne peut légalement être limitée.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 10. Propriété intellectuelle</h2>
      <p>
        L&apos;utilisation du Site ne confère aucun droit. L&apos;ensemble des contenus du
        Site (textes, modèles, base de fondements juridiques, logiciels) reste la
        propriété exclusive de DIXIT LLC et ne peut être reproduit, diffusé ou
        commercialisé sans accord écrit préalable. Le Client conserve la
        propriété des documents et des données qu&apos;il transmet.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 11. Données personnelles</h2>
      <p>
        Les données personnelles du Client sont traitées conformément au
        Règlement (UE) 2016/679 (RGPD) et à la loi Informatique et Libertés.
        Le Client dispose d&apos;un droit d&apos;accès, de rectification, d&apos;effacement,
        de limitation, d&apos;opposition et de portabilité, exerçable à l&apos;adresse
        <span className="font-medium"> contact@recours-permis-pv.com</span>, ainsi
        que d&apos;un droit de réclamation auprès de la CNIL. Les détails du
        traitement figurent dans la politique de confidentialité du Site.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 12. Réclamations et règlement amiable</h2>
      <p>
        Le Client peut à tout moment adresser une réclamation par courrier
        électronique à <strong>contact@recours-permis-pv.com</strong>, en
        indiquant ses coordonnées, le numéro de son Dossier et l&apos;objet de sa
        réclamation.
      </p>
      <p>
        SOS Amende s&apos;engage à traiter chaque réclamation avec impartialité,
        équité et gratuité : la réclamation est examinée, lorsque l&apos;organisation
        le permet, par une personne qui n&apos;a pas participé à l&apos;instruction du
        Dossier concerné ; le Client peut présenter ses observations et ses
        pièces ; il reçoit un accusé de réception sous sept (7) jours et une
        réponse écrite et motivée sous trente (30) jours à compter de la
        réception de sa réclamation.
      </p>
      <p>
        Cette procédure amiable est interne à SOS Amende. Elle ne constitue pas
        une médiation de la consommation au sens des articles L. 611-1 et
        suivants du Code de la consommation et elle ne prive le Client d&apos;aucun
        recours : il reste libre de recourir à tout mode alternatif de
        règlement des litiges de son choix et de saisir les juridictions
        compétentes.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 12 bis. Médiation de la consommation</h2>
      <p>
        Conformément aux articles L. 612-1 et suivants du Code de la
        consommation, le Client Consommateur peut recourir gratuitement à un
        médiateur de la consommation en vue de la résolution amiable de tout
        litige l&apos;opposant à SOS Amende. L&apos;adhésion de SOS Amende auprès d&apos;un
        organisme de médiation de la consommation agréé est en cours de
        finalisation ; ses coordonnées seront communiquées dans les présentes
        CGV et sur le Site dès l&apos;adhésion effective. Cette médiation est
        gratuite pour le consommateur, indépendante, et ne prive le Client
        d&apos;aucun recours : il reste libre de saisir les juridictions compétentes.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 13. Force majeure</h2>
      <p>
        SOS Amende ne saurait être tenue responsable en cas d&apos;inexécution de ses
        engagements due à un cas de force majeure au sens de l&apos;article 1218 du
        Code civil (catastrophes naturelles, émeutes, guerres, épidémies,
        défaillance des réseaux de télécommunication hors de son contrôle).
        Dans cette hypothèse, le Client en est informé ainsi que des mesures
        prises pour y remédier.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Article 14. Modification des CGV, droit applicable et juridiction</h2>
      <p>
        SOS Amende peut modifier les présentes CGV. Les CGV applicables sont
        celles en vigueur à la date de la Commande.
      </p>
      <p>
        Les présentes CGV sont régies par les lois de l&apos;État du Wyoming
        (États-Unis). Toutefois, si le Client réside dans l&apos;Union européenne, il
        bénéficie en toute hypothèse des dispositions impératives et
        protectrices de la loi de son pays de résidence habituelle (Règlement
        européen Rome I), lesquelles prévalent sur le droit américain.
      </p>
      <p>
        En cas de litige, le Client Consommateur peut saisir, à son choix, la
        juridiction du lieu où il demeure ou les tribunaux compétents en
        application du droit applicable. À défaut de résolution amiable, tout
        litige avec un Client professionnel relève des tribunaux compétents.
      </p>
    </LegalPage>
  );
}

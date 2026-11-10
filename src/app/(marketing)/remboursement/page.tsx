import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { PRIX_AMENDE, PRIX_CONTENTIEUX, PRIX_SUSPENSION, PRIX_OPTION_LRAR } from "@/lib/tarifs";

export const metadata: Metadata = {
  title: "Politique de remboursement",
};

export default function RemboursementPage() {
  return (
    <LegalPage title="Politique de remboursement" updatedAt="10 novembre 2026">
      <h2 className="text-lg font-semibold text-zinc-900">1. Champ d'application</h2>
      <p>
        La présente politique concerne SOS Amende (recours-permis-pv.com),
        service édité par DIXIT LLC, société à responsabilité limitée
        immatriculée dans l'État du Wyoming (États-Unis) sous le numéro
        2026-002016662, dont le siège social est situé 30 N Gould St, Ste N,
        Sheridan, WY 82801, États-Unis. Elle complète les conditions générales
        de vente (CGV). En cas de contradiction, la disposition la plus
        favorable au Client Consommateur s'applique.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">2. Exécution immédiate et droit de rétractation</h2>
      <p>
        Le Client Consommateur dispose d'un délai de quatorze (14) jours pour se
        rétracter (article L. 221-18 du Code de la consommation). Le Service
        étant exécuté de manière immédiate, le Client demande expressément, au
        moment de la commande et avant le paiement, que l'exécution commence
        avant la fin de ce délai, et reconnaît qu'il perdra son droit de
        rétractation dès que le Service aura été pleinement exécuté (articles
        L. 221-25 et L. 221-28). Cette demande est matérialisée par une case à
        cocher obligatoire.
      </p>
      <p>
        Le Service est pleinement exécuté lorsque la lettre validée par le
        juriste a été mise à disposition du Client. Si le Client se rétracte
        avant, il règle uniquement un montant proportionné à la part du Service
        déjà fournie, et le surplus lui est remboursé.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">3. Les offres</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>{PRIX_AMENDE} €</strong> TTC : contestation d'une amende forfaitaire.</li>
        <li><strong>{PRIX_CONTENTIEUX} €</strong> TTC : contentieux contraventionnel (4e et 5e classe), hors consignation. Le paiement est rattaché au dossier.</li>
        <li><strong>{PRIX_SUSPENSION} €</strong> TTC : suspension ou invalidation du permis.</li>
        <li>
          <strong>Option lettre recommandée (+ {PRIX_OPTION_LRAR} €)</strong> : elle
          n'est plus remboursable dès que l'envoi recommandé a été initié en
          votre nom.
        </li>
      </ul>

      <h2 className="text-lg font-semibold text-zinc-900">4. Rejet du dossier par le juriste</h2>
      <p>
        Si le juriste constate qu'aucun fondement juridique valable n'existe et
        refuse de valider la lettre, le Service n'a pas été rendu. Vous
        choisissez alors : conserver le crédit, que vous pouvez réutiliser pour
        une autre démarche sur la plateforme, ou obtenir son remboursement par
        virement dans les quatorze (14) jours suivant votre demande.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">5. Erreur de paiement ou double paiement</h2>
      <p>
        Si un incident entraîne deux paiements pour la même démarche, ou un
        paiement erroné, le montant indu vous est remboursé dans les quatorze
        (14) jours suivant votre signalement.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">6. Résultat de la contestation</h2>
      <p>
        SOS Amende fournit une aide à la contestation avec validation par un
        juriste, sans garantie du résultat. Le rejet de votre contestation par
        l'autorité compétente (officier du ministère public, préfet,
        juridiction) n'ouvre pas droit à remboursement, sauf manquement de
        SOS Amende à ses obligations.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">7. Comment demander un remboursement</h2>
      <p>
        Écrivez à contact@recours-permis-pv.com en indiquant votre numéro de
        dossier et le motif. Nous accusons réception sous sept (7) jours. Si la
        demande est acceptée, le remboursement est effectué dans les quatorze
        (14) jours par virement bancaire, ou sur le moyen de paiement utilisé
        lorsque le paiement par carte sera disponible.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">8. Difficultés de paiement</h2>
      <p>
        En cas de difficulté sur un dossier, nous vous invitons à nous contacter
        en premier à contact@recours-permis-pv.com afin de la résoudre
        rapidement. Cela n'affecte pas vos droits auprès de votre banque ou de
        votre prestataire de paiement.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">9. Réclamations et contact</h2>
      <p>
        Les réclamations sont traitées selon l'article 12 des CGV.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>E-mail : contact@recours-permis-pv.com</li>
        <li>Siège social : DIXIT LLC, 30 N Gould St, Ste N, Sheridan, WY 82801, États-Unis</li>
      </ul>
    </LegalPage>
  );
}

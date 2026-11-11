import type { Metadata } from "next";
import { PRIX_AMENDE, PRIX_CONTENTIEUX, PRIX_SUSPENSION, PRIX_OPTION_LRAR } from "@/lib/tarifs";

export const metadata: Metadata = {
  title: "Questions fréquentes (FAQ) — SOS Amende",
  description:
    "Réponses aux questions les plus courantes : fonctionnement, prix, paiement, délais, rétractation et protection des données.",
};

type Faq = { question: string; reponse: string };

const SECTIONS: { titre: string; faqs: Faq[] }[] = [
  {
    titre: "Le service",
    faqs: [
      {
        question: "Qu'est-ce que SOS Amende ?",
        reponse:
          "SOS Amende est un logiciel en ligne d'aide administrative à la préparation de la contestation d'une amende forfaitaire (requête en exonération) ou d'une décision de rétention, de suspension ou d'invalidation du permis de conduire. Il vous guide de l'analyse de votre document jusqu'à l'envoi de votre contestation.",
      },
      {
        question: "SOS Amende est-il un cabinet d'avocats ?",
        reponse:
          "Non. SOS Amende est un logiciel d'aide administrative. Il ne fournit pas de conseil juridique, n'assure aucune représentation en justice et ne garantit pas le résultat d'une contestation. Si votre situation relève d'un délit, nous vous orientons vers un avocat.",
      },
      {
        question: "Comment se déroule la contestation, étape par étape ?",
        reponse:
          "1) Vous réglez le service et téléversez votre document (avis de contravention ou décision). 2) Le document est lu automatiquement puis vous relisez et corrigez les informations. 3) Le moteur détecte les fondements juridiques applicables. 4) Une lettre est générée, que vous validez et signez. 5) Un juriste partenaire relit la lettre. 6) La contestation est transmise (dépôt assisté en ligne ou lettre recommandée en option) et vous suivez la décision.",
      },
      {
        question: "Quels documents puis-je contester ?",
        reponse:
          "Les avis de contravention (amendes forfaitaires), les décisions de rétention, de suspension ou d'invalidation du permis de conduire. Les délits (tribunal correctionnel, conduite sans permis ou sans assurance, stupéfiants…) ne relèvent pas du service : ils nécessitent un avocat.",
      },
    ],
  },
  {
    titre: "Prix et paiement",
    faqs: [
      {
        question: "Combien ça coûte ?",
        reponse: `La contestation d'une amende forfaitaire est à ${PRIX_AMENDE} € TTC, le contentieux contraventionnel (4e/5e classe) à ${PRIX_CONTENTIEUX} € TTC et le traitement d'une suspension ou invalidation à ${PRIX_SUSPENSION} € TTC. Une option d'envoi en lettre recommandée avec accusé de réception est disponible pour ${PRIX_OPTION_LRAR} € supplémentaires.`,
      },
      {
        question: "Comment je paie ?",
        reponse:
          "Par virement bancaire. Les coordonnées du compte bénéficiaire (RIB) vous sont communiquées lors de la finalisation de votre dossier ; vous effectuez le virement depuis votre établissement bancaire. Le paiement par carte bancaire est en cours de déploiement.",
      },
      {
        question: "Le scan et l'analyse sont-ils gratuits ?",
        reponse:
          "Oui. Le téléversement de votre document, la lecture automatique et l'analyse préliminaire sont gratuits : vous ne payez qu'au moment de finaliser votre dossier.",
      },
      {
        question: "Que se passe-t-il si le juriste rejette mon dossier ?",
        reponse:
          "Votre crédit vous est rendu et vous pouvez le réutiliser pour un autre dossier. Pour un contentieux contraventionnel, le paiement est rattaché au dossier et remboursé en cas de rejet.",
      },
    ],
  },
  {
    titre: "Délais et procédure",
    faqs: [
      {
        question: "Quel délai pour contester une amende ?",
        reponse:
          "Le délai de contestation d'une amende forfaitaire est de 45 jours à compter de la constatation de l'infraction. Ne tardez pas : ce délai est impératif.",
      },
      {
        question: "Quel délai pour contester une suspension ?",
        reponse:
          "Le recours contre une décision de suspension de permis doit être engagé dans un délai de 2 mois. Les délais sont rappelés dans votre dossier, à titre indicatif.",
      },
      {
        question: "Qu'est-ce que la consignation ?",
        reponse:
          "Pour les contraventions de 4e et 5e classe, la contestation suppose une consignation préalable du montant de l'amende, versée directement à l'administration. Cette somme n'est jamais encaissée par SOS Amende et vous est restituée si la contestation aboutit.",
      },
      {
        question: "Et si c'est un délit ?",
        reponse:
          "Les délits (convocation devant le tribunal correctionnel, amende forfaitaire délictuelle, conduite sans permis ou sans assurance…) ne relèvent pas du service. Nous vous orientons vers un avocat partenaire, et aucun paiement n'est débité.",
      },
    ],
  },
  {
    titre: "Rétractation et remboursement",
    faqs: [
      {
        question: "Puis-je me rétracter après paiement ?",
        reponse:
          "Vous disposez d'un délai légal de 14 jours pour vous rétracter. Toutefois, le service étant exécuté de manière immédiate après paiement, vous renoncez expressément à ce droit en cochant la case prévue à cet effet (exécution immédiate, articles L. 221-25 et L. 221-28 du Code de la consommation).",
      },
      {
        question: "Comment demander un remboursement ?",
        reponse:
          "Tout remboursement dû (rejet du dossier par le juriste, rétractation avant pleine exécution) est effectué par virement dans un délai maximal de 14 jours. Contactez-nous à contact@recours-permis-pv.com en indiquant votre référence.",
      },
    ],
  },
  {
    titre: "Données personnelles",
    faqs: [
      {
        question: "Mes données sont-elles protégées ?",
        reponse:
          "Oui. Vos données sont traitées conformément au RGPD : collectées uniquement pour traiter votre dossier, jamais revendues, conservées pendant la durée du traitement puis 12 mois après la clôture, avec effacement possible à tout moment sur simple demande. Le détail figure dans notre politique de confidentialité.",
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold">Questions fréquentes</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Les réponses aux questions les plus courantes sur SOS Amende.
      </p>

      <div className="mt-10 flex flex-col gap-10">
        {SECTIONS.map((section) => (
          <section key={section.titre}>
            <h2 className="text-lg font-semibold text-zinc-900">{section.titre}</h2>
            <div className="mt-4 flex flex-col gap-2">
              {section.faqs.map((faq) => (
                <details
                  key={faq.question}
                  className="group rounded-2xl border border-zinc-200 bg-white"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
                    {faq.question}
                    <span className="text-zinc-400 transition group-open:rotate-90">›</span>
                  </summary>
                  <p className="border-t border-zinc-100 px-5 py-4 text-sm leading-7 text-zinc-600">
                    {faq.reponse}
                  </p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

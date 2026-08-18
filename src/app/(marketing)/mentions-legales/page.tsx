import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Mentions légales",
};

export default function MentionsLegalesPage() {
  return (
    <LegalPage title="Mentions légales" updatedAt="13 août 2026">
      <h2 className="text-lg font-semibold text-zinc-900">Éditeur du service</h2>
      <p>
        SOS Amende est un service édité par la société [Raison sociale à
        compléter], immatriculée au RCS sous le numéro [SIREN à compléter],
        dont le siège social est situé [Adresse à compléter].
      </p>
      <p>
        Directeur de la publication : [Nom à compléter].
        Contact : contact@sosamende.fr
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Hébergement</h2>
      <p>
        Le Service est hébergé par [Hébergeur à compléter], dont le siège est
        situé [Adresse à compléter], dans l'Union européenne.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Propriété intellectuelle</h2>
      <p>
        L'ensemble des contenus, marques et données du Service est protégé par
        le droit de la propriété intellectuelle. Toute reproduction sans
        autorisation est interdite.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Statut juridique du service</h2>
      <p>
        SOS Amende est un éditeur de logiciels et de contenus d'aide. Il ne
        fournit ni ne revendique la fourniture de prestations de conseil
        juridique. Les contenus générés sont fondés sur des règles
        procédurales de droit commun, vérifiées à la date de leur mise en
        ligne.
      </p>
    </LegalPage>
  );
}

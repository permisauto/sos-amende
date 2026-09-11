import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Mentions légales",
};

export default function MentionsLegalesPage() {
  return (
    <LegalPage title="Mentions légales" updatedAt="11 septembre 2026">
      <h2 className="text-lg font-semibold text-zinc-900">Éditeur du service</h2>
      <p>
        SOS Amende est un service édité par la société DIXIT LLC, société à
        responsabilité limitée immatriculée dans l'État du Wyoming (États-Unis),
        dont le siège social est situé 30 N Gould St, Ste R, Sheridan,
        WY 82801, États-Unis.
      </p>
      <p>
        Contact : contact@sosamende.fr
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">Hébergement</h2>
      <p>
        Le Service est hébergé par HOSTINGER, dont le siège est situé
        [Adresse de l'hébergeur à compléter].
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

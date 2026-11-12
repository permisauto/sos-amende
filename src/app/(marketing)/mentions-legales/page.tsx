import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Mentions légales",
};

export default function MentionsLegalesPage() {
  return (
    <LegalPage title="Mentions légales" updatedAt="9 novembre 2026">
      <h2 className="text-lg font-semibold text-zinc-900">1. Éditeur du site</h2>
      <p>
        Le site internet https://recours-permis-pv.com est édité par la société
        DIXIT LLC, société constituée et régie selon les lois de l&apos;État du
        Wyoming (États-Unis), immatriculée sous le numéro 2026-002016662, dont
        le siège social est situé au 30 N Gould St, Ste N, Sheridan, WY 82801,
        États-Unis.
      </p>
      <p>Contact électronique : contact@recours-permis-pv.com</p>
      <p>Téléphone (WhatsApp) : +34 613 88 55 73</p>
      <p>Délégué à la protection des données : contact@recours-permis-pv.com</p>

      <h2 className="text-lg font-semibold text-zinc-900">2. Directeur de la publication</h2>
      <p>
        Le directeur de la publication du site est Mr ALLOU SI, en sa qualité de
        représentant légal de la société DIXIT LLC.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">3. Hébergement du site</h2>
      <p>
        Le site internet est hébergé par la société Vercel Inc., dont le siège
        social est situé au 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis
        (site internet : https://vercel.com).
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">4. Propriété intellectuelle</h2>
      <p>
        L&apos;ensemble des contenus (textes, graphismes, interfaces, logiciels,
        logos) présents sur le site https://recours-permis-pv.com est la
        propriété exclusive de DIXIT LLC ou de ses partenaires techniques. Toute
        reproduction, distribution ou exploitation non autorisée de ces éléments
        est strictement interdite.
      </p>

      <h2 className="text-lg font-semibold text-zinc-900">5. Statut juridique du service</h2>
      <p>
        SOS Amende est un logiciel d&apos;aide administrative. Il ne
        fournit ni ne revendique la fourniture de prestations de conseil
        juridique. Les contenus générés sont fondés sur des règles procédurales
        de droit commun, vérifiées à la date de leur mise en ligne.
      </p>
    </LegalPage>
  );
}

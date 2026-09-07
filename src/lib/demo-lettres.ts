/**
 * Stockage en mémoire des lettres de démo éditées par le juriste.
 * Sur Vercel les instances sont éphémères, donc non persistant — suffisant pour la démo.
 */
const edited: Map<string, string> = new Map();

export const DEMO_LETTRES_BASE: Record<string, string> = {
  "pv-sign-002":
    "À l'attention de l'Officier du Ministère Public,\n\nJe soussigné Jean Dupont, titulaire du certificat d'immatriculation du véhicule portant la plaque XY-999-ZZ, conteste l'avis de contravention n° PV-SIGN-002 du 2026-05-20.\n\nLa plaque d'immatriculation XY-999-ZZ mentionnée sur l'avis de contravention ne correspond pas à mon véhicule. Il s'agit d'une erreur matérielle de la part des services verbalisateurs.\n\nConformément à l'article 429 du Code de procédure pénale, l'exonération est demandée lorsque l'avis de contravention est entaché d'une erreur portant sur l'identification du véhicule ou de son titulaire.\n\nJe demande en conséquence l'exonération de l'amende de 90 € qui m'est réclamée.",
  "pv-pret-003":
    "À l'attention de l'Officier du Ministère Public,\n\nJe soussigné Jean Dupont, conteste l'avis de contravention n° PV-PRET-003 du 2026-05-10 relatif au véhicule immatriculé CD-456-EF.\n\nDes travaux avec signalisation temporaire étaient présents au lieu dit A10 - Orléans le 10 mai 2026. La signalisation n'était pas conforme aux prescriptions de l'article R. 411-8 du Code de la route, ce qui entache la régularité de la constatation.\n\nEn application de l'article R. 411-8 du Code de la route, la limitation de vitesse dans les zones de travaux n'est opposable que si la signalisation réglementaire est en place.\n\nJe demande en conséquence l'annulation de l'amende de 45 € qui m'est réclamée.",
  "dec-sign-008":
    "À l'attention de Monsieur le Préfet des Bouches-du-Rhône,\n\nJe soussigné Jean Dupont, conteste la décision n° DEC-SIGN-008 du 2026-06-15 par laquelle vous avez prononcé la suspension de mon permis de conduire pour une durée de 4 mois.\n\nCette décision a été prise sans que j'aie été mis en mesure de présenter des observations préalables, alors qu'aucune urgence caractérisée ne justifiait de s'en dispenser. En application des articles L. 121-1 et L. 211-2 du code des relations entre le public et l'administration, une décision individuelle défavorable prise en considération de la personne doit être précédée d'une procédure contradictoire permettant à l'intéressé de présenter ses observations (Conseil d'État, 20 avril 2021, n° 438114).\n\nJe demande en conséquence le retrait de la décision de suspension prise à mon encontre.",
  "dec-pret-009":
    "À l'attention de Monsieur le Préfet de Paris,\n\nJe soussigné Jean Dupont, conteste la décision n° DEC-PRET-009 du 2026-06-01 par laquelle vous avez prononcé la suspension de mon permis de conduire pour une durée de 12 mois.\n\nCette décision a été prise sans procédure contradictoire préalable, en violation des articles L. 121-1 et L. 211-2 CRPA.\n\nJe demande le retrait de cette décision.",
};

export function getDemoLettre(id: string): string | null {
  return edited.get(id) ?? DEMO_LETTRES_BASE[id] ?? null;
}

export function setDemoLettre(id: string, lettre: string): void {
  edited.set(id, lettre);
}

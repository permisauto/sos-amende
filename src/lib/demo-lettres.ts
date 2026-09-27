/**
 * Stockage en mémoire des lettres de démo éditées par le juriste.
 * Sur Vercel les instances sont éphémères, donc non persistant — suffisant pour la démo.
 */
const edited: Map<string, string> = new Map();

export const DEMO_LETTRES_BASE: Record<string, string> = {
  "pv-sign-002":
    "À l'attention de l'Officier du ministère public près le tribunal compétent,\n\nObjet : Contestation de l'avis de contravention n° PV-SIGN-002 du 20 mai 2026\n\nMadame, Monsieur,\n\nJe soussigné Jean Dupont, titulaire du certificat d'immatriculation du véhicule immatriculé XY-999-ZZ, conteste l'avis de contravention n° PV-SIGN-002 du 20 mai 2026 qui m'a été notifié.\n\nLa plaque d'immatriculation XY-999-ZZ mentionnée sur l'avis de contravention ne correspond pas au certificat d'immatriculation de mon véhicule : il s'agit d'une erreur matérielle commise par les services verbalisateurs, laquelle affecte l'identification du véhicule et de son titulaire.\n\nEn application de l'article 530-1 du Code de procédure pénale, l'exonération peut être obtenue lorsque l'avis de contravention est entaché d'une erreur portant sur l'identification du véhicule ou de son titulaire.\n\nEn conséquence, je vous demande de bien vouloir prononcer mon exonération du paiement de l'amende de 90 € qui m'est réclamée.\n\nJe vous prie d'agréer, Madame, Monsieur, l'expression de ma considération distinguée.",
  "pv-pret-003":
    "À l'attention de l'Officier du ministère public près le tribunal compétent,\n\nObjet : Contestation de l'avis de contravention n° PV-PRET-003 du 10 mai 2026\n\nMadame, Monsieur,\n\nJe soussigné Jean Dupont, titulaire du certificat d'immatriculation du véhicule immatriculé CD-456-EF, conteste l'avis de contravention n° PV-PRET-003 du 10 mai 2026 qui m'a été notifié.\n\nDes travaux avec signalisation temporaire étaient en cours au lieu dit A10 - Orléans le 10 mai 2026. La signalisation n'était pas conforme aux prescriptions de l'article R. 411-8 du Code de la route, ce qui entache la régularité de la constatation de l'infraction.\n\nEn application de l'article R. 411-8 du Code de la route, la limitation de vitesse dans les zones de travaux n'est opposable que si la signalisation réglementaire est en place.\n\nEn conséquence, je vous demande de bien vouloir annuler la contravention n° PV-PRET-003 et m'exonérer du paiement de l'amende de 45 € qui m'est réclamée.\n\nJe vous prie d'agréer, Madame, Monsieur, l'expression de ma considération distinguée.",
  "dec-sign-008":
    "À l'attention de Monsieur le Préfet des Bouches-du-Rhône,\n\nObjet : Recours contre la décision de suspension n° DEC-SIGN-008 du 15 juin 2026\n\nMonsieur le Préfet,\n\nJe soussigné Jean Dupont, conteste la décision n° DEC-SIGN-008 du 15 juin 2026 par laquelle vous avez prononcé la suspension de mon permis de conduire pour une durée de quatre mois.\n\nCette décision a été prise sans que j'aie été mis en mesure de présenter des observations préalables, alors qu'aucune urgence caractérisée ne justifiait de s'en dispenser. En application des articles L. 121-1 et L. 211-2 du Code des relations entre le public et l'administration, une décision individuelle défavorable prise en considération de la personne doit être précédée d'une procédure contradictoire permettant à l'intéressé de présenter ses observations (Conseil d'État, 20 avril 2021, n° 438114).\n\nEn conséquence, je vous demande de bien vouloir retirer la décision de suspension prise à mon encontre.\n\nJe vous prie d'agréer, Monsieur le Préfet, l'expression de ma considération distinguée.",
  "dec-pret-009":
    "À l'attention de Monsieur le Préfet de Paris,\n\nObjet : Recours contre la décision de suspension n° DEC-PRET-009 du 1er juin 2026\n\nMonsieur le Préfet,\n\nJe soussigné Jean Dupont, conteste la décision n° DEC-PRET-009 du 1er juin 2026 par laquelle vous avez prononcé la suspension de mon permis de conduire pour une durée de douze mois.\n\nCette décision a été prise sans procédure contradictoire préalable, en méconnaissance des articles L. 121-1 et L. 211-2 du Code des relations entre le public et l'administration, lesquels imposent de permettre à l'intéressé de présenter des observations avant toute décision individuelle défavorable prise en considération de la personne.\n\nEn conséquence, je vous demande de bien vouloir retirer la décision de suspension prise à mon encontre.\n\nJe vous prie d'agréer, Monsieur le Préfet, l'expression de ma considération distinguée.",
};

export function getDemoLettre(id: string): string | null {
  return edited.get(id) ?? DEMO_LETTRES_BASE[id] ?? null;
}

export function setDemoLettre(id: string, lettre: string): void {
  edited.set(id, lettre);
}

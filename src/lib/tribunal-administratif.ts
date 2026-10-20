/**
 * Tribunal administratif territorialement compétent, déduit du département du
 * requérant. Source unique : article R. 221-3 du code de justice administrative
 * (siège et ressort des tribunaux administratifs, version en vigueur depuis le
 * 9 novembre 2015) — la répartition légale est faite **par département**.
 *
 * Module pur : aucune donnée n'est inventée. Sans code postal exploitable,
 * `tribunalPourAdresse` retourne `null` et l'en-tête reste générique (la
 * juridiction est alors précisée au dépôt). Les rares exceptions liées à
 * l'emprise d'un aérodrome (Orly → Melun, Roissy → Montreuil) ne concernent
 * pas l'adresse de résidence du requérant.
 */

/** Siège du tribunal administratif par code de département. */
const TA_PAR_DEPARTEMENT: Record<string, string> = {
  "01": "Lyon",
  "02": "Amiens",
  "03": "Clermont-Ferrand",
  "04": "Marseille",
  "05": "Marseille",
  "06": "Nice",
  "07": "Lyon",
  "08": "Châlons-en-Champagne",
  "09": "Toulouse",
  "10": "Châlons-en-Champagne",
  "11": "Montpellier",
  "12": "Toulouse",
  "13": "Marseille",
  "14": "Caen",
  "15": "Clermont-Ferrand",
  "16": "Poitiers",
  "17": "Poitiers",
  "18": "Orléans",
  "19": "Limoges",
  "2A": "Bastia",
  "2B": "Bastia",
  "21": "Dijon",
  "22": "Rennes",
  "23": "Limoges",
  "24": "Bordeaux",
  "25": "Besançon",
  "26": "Grenoble",
  "27": "Rouen",
  "28": "Orléans",
  "29": "Rennes",
  "30": "Nîmes",
  "31": "Toulouse",
  "32": "Pau",
  "33": "Bordeaux",
  "34": "Montpellier",
  "35": "Rennes",
  "36": "Limoges",
  "37": "Orléans",
  "38": "Grenoble",
  "39": "Besançon",
  "40": "Pau",
  "41": "Orléans",
  "42": "Lyon",
  "43": "Clermont-Ferrand",
  "44": "Nantes",
  "45": "Orléans",
  "46": "Toulouse",
  "47": "Bordeaux",
  "48": "Nîmes",
  "49": "Nantes",
  "50": "Caen",
  "51": "Châlons-en-Champagne",
  "52": "Châlons-en-Champagne",
  "53": "Nantes",
  "54": "Nancy",
  "55": "Nancy",
  "56": "Rennes",
  "57": "Strasbourg",
  "58": "Dijon",
  "59": "Lille",
  "60": "Amiens",
  "61": "Caen",
  "62": "Lille",
  "63": "Clermont-Ferrand",
  "64": "Pau",
  "65": "Pau",
  "66": "Montpellier",
  "67": "Strasbourg",
  "68": "Strasbourg",
  "69": "Lyon",
  "70": "Besançon",
  "71": "Dijon",
  "72": "Nantes",
  "73": "Grenoble",
  "74": "Grenoble",
  "75": "Paris",
  "76": "Rouen",
  "77": "Melun",
  "78": "Versailles",
  "79": "Poitiers",
  "80": "Amiens",
  "81": "Toulouse",
  "82": "Toulouse",
  "83": "Toulon",
  "84": "Nîmes",
  "85": "Nantes",
  "86": "Poitiers",
  "87": "Limoges",
  "88": "Nancy",
  "89": "Dijon",
  "90": "Besançon",
  "91": "Versailles",
  "92": "Cergy-Pontoise",
  "93": "Montreuil",
  "94": "Melun",
  "95": "Cergy-Pontoise",
  // France d'outre-mer (codes INSEE à 3 chiffres).
  "971": "Basse-Terre",
  "972": "Schœlcher",
  "973": "Cayenne",
  "974": "Saint-Denis",
  "976": "Mamoudzou",
};

/**
 * Extrait le code de département d'une adresse française, à partir du code
 * postal (5 chiffres consécutifs). Réutilise la règle INSEE :
 * - « 97xxxx » / « 98xxxx » → 3 chiffres (971 Guadeloupe … 976 Mayotte) ;
 * - Corse « 20xxx » → 2A (20000-20190, Corse-du-Sud) ou 2B (20200+, Haute-Corse),
 *   selon le code commune ;
 * - sinon les 2 premiers chiffres.
 * Retourne `null` si aucun code postal exploitable n'est trouvé.
 */
export function departementDepuisAdresse(
  adresse: string | null | undefined,
): string | null {
  if (!adresse) return null;
  const m = /\b(\d{5})\b/.exec(adresse);
  if (!m) return null;
  const cp = m[1];
  if (cp.startsWith("97") || cp.startsWith("98")) {
    const trois = cp.slice(0, 3);
    return trois in TA_PAR_DEPARTEMENT ? trois : null;
  }
  if (cp.startsWith("20")) {
    // Corse : codes postaux 20000-20190 → Corse-du-Sud (2A, siège Bastia),
    // 20200+ → Haute-Corse (2B, même siège). Coupure au code commune 190.
    const commune = Number(cp.slice(2));
    if (!Number.isFinite(commune)) return null;
    return commune <= 190 ? "2A" : "2B";
  }
  const dept = cp.slice(0, 2);
  return dept in TA_PAR_DEPARTEMENT ? dept : null;
}

/** Siège du tribunal administratif pour un code de département. */
export function tribunalPourDepartement(code: string | null): string | null {
  if (!code) return null;
  return TA_PAR_DEPARTEMENT[code] ?? null;
}

/**
 * Tribunal administratif territorialement compétent pour une adresse, d'après
 * R. 221-3 du CJA. `null` si l'adresse ne permet pas d'identifier le ressort
 * (aucune valeur devinée — la juridiction sera précisée au dépôt).
 */
export function tribunalPourAdresse(
  adresse: string | null | undefined,
): string | null {
  return tribunalPourDepartement(departementDepuisAdresse(adresse));
}

/**
 * Civilité d'en-tête de la requête contentieuse, avec la juridiction nommée
 * lorsqu'elle est connue. Sans tribunal identifié, on reste générique.
 */
export function destinataireRequete(tribunal: string | null): string {
  const base =
    "À l'attention de Monsieur le Président et Mesdames et Messieurs les Conseillers du Tribunal administratif";
  return tribunal ? `${base} de ${tribunal}` : base;
}

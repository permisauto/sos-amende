-- Cure de données (2026-10-19) : deux familles de failles `ACTIVE` sans valeur
-- juridique sont écartées.
--
-- (a) **Squelettes du secours local de la veille** (`extractionLocale`, sans
--     IA) : leur « regle » est littéralement une citation de tête du texte —
--     souvent la paraphrase d'un recours **rejeté** —, leurs articles sont
--     procéduraux (L. 521-1 / R. 222-1 / L. 761-1 CJA) et leur
--     `templateLettre`/`templateRefere` un squelette mécanique non vide (ce qui
--     les faisait passer le verrou d'activation). 38 étaient `ACTIVE` (donc
--     envoyables), 17 `PROPOSEE`.
-- (b) **3 décisions défavorables promues par erreur** (validées depuis le
--     drawer de la veille) : elles présentent une décision **perdue** comme un
--     moyen de contestation.
--        * cmv39xzfb000c06jhh7tf72kr — TA Nice, ordonnance 15/09/2026
--          (« la suspension est une mesure de police administrative ») ;
--        * cmv4pdq42000306ijem301u86 — TA Pau, 01/09/2026, n° 2602963
--          (rejet : condition d'urgence non remplie) ;
--        * cmv4pdq50000406ij5vpldmb6 — TA Lille, ordonnance 11/09/2026
--          (R. 222-1 CJA : irrecevabilité / compétence pénale).
--
-- Aucun `DossierFaille` ni `Dossier` ne référence ces lignes (vérifié) : aucune
-- lettre client n'est affectée.
--
-- Verrous amont posés dans le même lot :
--   * `src/lib/failles.ts::manquantsPourActivation` — un secours local ne
--     compte plus comme règle (bloque activation admin, sync catalogue, pack) ;
--   * `src/lib/veille-ingestion.ts::estPropositionPromouvable` — l'auto-
--     proposition saute les propositions `methode: "locale"`.
-- Idempotent : ne touche que les lignes correspondantes, quel que soit leur
-- statut de départ. Les sources suivent (« la source suit sa faille »).

UPDATE "FailleJuridique"
SET "statut" = 'INACTIVE',
    "templateLettre" = '',
    "templateRefere" = '',
    "templateGracieux" = ''
WHERE "statut" IN ('ACTIVE', 'PROPOSEE')
  AND (
    "regle" ILIKE 'Extraction locale (sans IA)%'
    OR "id" IN (
      'cmv39xzfb000c06jhh7tf72kr',
      'cmv4pdq42000306ijem301u86',
      'cmv4pdq50000406ij5vpldmb6'
    )
  );

UPDATE "SourceJuridique"
SET "statut" = 'ECARTE', "reviewedAt" = now()
WHERE "statut" IN ('NOUVEAU', 'PROMU')
  AND "failleId" IN (
    SELECT "id" FROM "FailleJuridique"
    WHERE "regle" ILIKE 'Extraction locale (sans IA)%'
       OR "id" IN (
         'cmv39xzfb000c06jhh7tf72kr',
         'cmv4pdq42000306ijem301u86',
         'cmv4pdq50000406ij5vpldmb6'
       )
  );

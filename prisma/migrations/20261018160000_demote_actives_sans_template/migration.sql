-- Cure de données : une faille ACTIVE sans template de lettre ne peut alimenter
-- aucune contestation (le moteur l'écarte d'office comme lettre principale, et
-- le juriste ne peut pas la confirmer). Les failles promues depuis la veille
-- avant le verrou d'activation (2026-10-18) repassent en PROPOSEE : elles
-- réapparaissent dans la bibliothèque avec le chip « Template à rédiger » et
-- seront réactivées après rédaction de la lettre.
--
-- Idempotent : no-op si aucune ligne ne correspond (le verrou applicatif
-- `validerPropositionSource` empêche désormais toute nouvelle occurrence).
UPDATE "FailleJuridique"
SET "statut" = 'PROPOSEE'
WHERE "statut" = 'ACTIVE'
  AND coalesce("templateLettre", '') = '';

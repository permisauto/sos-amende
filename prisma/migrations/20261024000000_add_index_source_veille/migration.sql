-- Migration : index composé pour la pagination progressive de la veille
-- Cible : SourceJuridique (filtre statut + tri score DESC + createdAt DESC)
-- Impact : O(log n) au lieu de O(n) sur la lecture des candidats d'extraction
-- Aucun changement fonctionnel — uniquement performance

CREATE INDEX IF NOT EXISTS "SourceJuridique_statut_score_createdAt_idx"
ON "SourceJuridique" ("statut", "score" DESC, "createdAt" DESC);

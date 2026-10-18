-- Add missing foreign key indexes (advisor Supabase performance)
-- Foreign keys without indexes identified : 12 (dont Account.userId, Courrier.dossierId, Dossier.failleJuridiqueId, Dossier.userId, DossierFaille.failleId/dossierId déjà partiellement, etc.)
-- Add non-unique indexes on FK columns to improve joins & deletes

-- NextAuth / accounts
CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");

-- Authenticator
CREATE INDEX IF NOT EXISTS "Authenticator_userId_idx" ON "Authenticator"("userId");

-- Sessions
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");

-- Dossier
CREATE INDEX IF NOT EXISTS "Dossier_userId_idx" ON "Dossier"("userId");
CREATE INDEX IF NOT EXISTS "Dossier_failleJuridiqueId_idx" ON "Dossier"("failleJuridiqueId");

-- DossierFaille (dossierId+failleId unique OK ; add index on failleId)
CREATE INDEX IF NOT EXISTS "DossierFaille_failleId_idx" ON "DossierFaille"("failleId");

-- Courrier
CREATE INDEX IF NOT EXISTS "Courrier_dossierId_idx" ON "Courrier"("dossierId");

-- Rappel
CREATE INDEX IF NOT EXISTS "Rappel_dossierId_idx" ON "Rappel"("dossierId");

-- LawyerMatch (dossierId unique OK)

-- Message / MessageInterne (already have composite)

-- Payment
CREATE INDEX IF NOT EXISTS "Payment_userId_idx" ON "Payment"("userId");
CREATE INDEX IF NOT EXISTS "Payment_dossierId_idx" ON "Payment"("dossierId");

-- LienDepot (dossierId unique OK)
-- Preuve (dossierId index OK)
-- AutoAlimentationTrace (no FK)
-- SourceJuridique (no direct FK)
-- FailleJuridique (no FK out)

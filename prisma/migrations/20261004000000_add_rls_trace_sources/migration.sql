-- Audit sécurité Supabase (advisor ERROR "rls_disabled_in_public") :
-- ces deux tables du schéma public n'avaient pas de RLS alors que toutes
-- les autres tables exposées en sont pourvues (migration
-- 20260922122859_enable_rls_on_all_tables). RLS activée sans policy =
-- accès refusé par défaut via l'API PostgREST ; l'app Prisma se connecte
-- avec le rôle postgres (bypassrls) → aucun impact applicatif.
ALTER TABLE "AutoAlimentationTrace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SourceJuridique" ENABLE ROW LEVEL SECURITY;

-- Advisor WARN "function_search_path_mutable" : verrouillage du search_path
-- de la trigger function si elle existe (corps sans noms de relations non
-- qualifiés). Sur certaines bases (dev locale) la fonction est absente.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'update_updated_at_column' AND n.nspname = 'public'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.update_updated_at_column() SET search_path = public';
  END IF;
END $$;

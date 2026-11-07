# 🚀 Checklist de Déploiement Production - SOS Amende

> **Prérequis :** Repository pushé sur `main`, Vercel connecté, Supabase project créé

---

## 📋 Phase 1 : Variables d'Environnement (Vercel Dashboard)

### Aller dans : **Vercel → Project → Settings → Environment Variables**

| Variable | Valeur | Environnement | Notes |
|----------|--------|---------------|-------|
| **DATABASE_URL** | `postgresql://user:pass@db.xxx.supabase.co:6543/postgres?pgbouncer=true` | Production | URL runtime Prisma. Pooler Supabase recommandé en serverless (5432 direct accepté). |
| **DIRECT_URL** | `postgresql://user:pass@db.xxx.supabase.co:5432/postgres` | Production | Connexion directe pour `prisma migrate deploy` / seed (verrous de session). |
| **AUTH_SECRET** | `openssl rand -base64 32` | Production | Générer : `openssl rand -base64 32` |
| **AUTH_RESEND_KEY** | `re_...` | Production | Clé Resend (domaine vérifié) |
| **EMAIL_FROM** | `SOS Amende <no-reply@votre-domaine.com>` | Production | Domaine vérifié sur Resend |
| **NEXT_PUBLIC_APP_URL** | `https://recours-permis-pv.com` | Production | URL canonique |
| **AUTH_URL** | `https://recours-permis-pv.com` | Production | Pour NextAuth v5 |
| **SUPER_ADMIN_EMAIL** | `admin@votre-domaine.com` | Production | Premier admin auto-promu |
| **REDIS_URL** | `redis://default:password@host:port` | Production | Recommandé (cache distribué) ; repli mémoire si absent |
| **STORAGE_DRIVER** | `s3` | Production | **Obligatoire en prod** (`local` refusé en production réelle) |
| **STORAGE_BUCKET** | `sos-amende-prod` | Production | Nom bucket S3 (Scaleway/OVH/AWS) |
| **STORAGE_REGION** | `fr-par` / `eu-west-1` | Production | Région bucket |
| **STORAGE_ENDPOINT** | `https://s3.fr-par.scw.cloud` | Production | Endpoint S3-compatible |
| **STORAGE_ACCESS_KEY** | `SCW...` | Production | Access key S3 |
| **STORAGE_SECRET_KEY** | `...` | Production | Secret key S3 |
| **NEXT_PUBLIC_RIB_IBAN** | `FR76...` | Production | IBAN réel (pas démo) — lu par `src/lib/rib.ts` |
| **NEXT_PUBLIC_RIB_BIC** | `BANKFRPP` | Production | BIC réel — lu par `src/lib/rib.ts` |
| **NEXT_PUBLIC_RIB_TITULAIRE** | `SOS AMENDE SAS` | Production | Titulaire compte — lu par `src/lib/rib.ts` |
| **OCR_PROVIDER** | `mistral-ocr` ou `gemini-flash` | Production | Jamais `mock` en prod |
| **MISTRAL_API_KEY** | `...` | Production | Si `mistral-ocr` |
| **GOOGLE_VISION_KEY** | `...` | Production | Si `google-vision` |
| **GEMINI_API_KEY** | `...` | Production | Si `gemini-flash` ou `VERIF_IA_PROVIDER=gemini` |
| **GEMINI_MODEL** | `gemini-3.6-flash` | Production | Modèle Gemini |
| **OCR_TIMEOUT_MS** | `20000` | Production | Watchdog global OCR (défaut 20 s) |
| **OCR_HTTP_TIMEOUT_MS** | `10000` | Production | Timeout par requête OCR (défaut 10 s) |
| **VERIF_IA_PROVIDER** | `gemini` | Production | `off` pour couper ; jamais `mock` en prod |
| **GEMINI_QUOTA_JOUR** | `20` | Production | Quota Gemini quotidien (palier gratuit) |
| **GEMINI_PART_EXTRACTION** | `5` | Production | Part du quota réservée à la veille |
| **GROQ_API_KEY** | `...` | Production | Optionnel (veille / health full) |
| **SIRET_PROVIDER** | `` (vide) | Production | API publique gratuite |
| **RATE_LIMIT_STORE** | `postgres` | Production | **Obligatoire en prod** pour rate-limit distribué |
| **CRON_SECRET** | `openssl rand -base64 32` | Production | Protège `/api/cron/*` et le health full |
| **SENTRY_DSN** | `https://...@sentry.io/...` | Production | DSN Sentry |
| **SENTRY_ORG** | `votre-org` | Production | Org Sentry |
| **SENTRY_PROJECT** | `sos-amende` | Production | Projet Sentry |
| **SENTRY_AUTH_TOKEN** | `...` | Production | Token Sentry pour sourcemaps |
| **ANTAI_MOCK** | `0` | Production | **0 = portail réel** ; mock interdit en prod sauf E2E explicite |
| **ANTAI_MOCK_TOKEN** | `` (vide) | Production | Dev/E2E uniquement |
| **ANTAI_REAL** | `0` | Production | **Laisser 0** tant que les sélecteurs RPA ne sont pas calibrés |
| **DRY_RUN** | `1` | Production | Si `ANTAI_REAL=1`, passer à `0` seulement après calibration |
| **ANTAI_URL** | `https://usagers.antai.gouv.fr` | Production | Portail ANTAI réel |
| **ANTAI_LOGIN** | `...` | Production | Compte service ANTAI |
| **ANTAI_PASSWORD** | `...` | Production | Mot de passe service |
| **DECISION_WAIT_JOURS** | `21` | Production | Délai avant consultation de la décision |
| **DECISION_ALERT_JOURS** | `45` | Production | Seuil d’alerte LRAR |
| **ENABLE_DEV_LOGIN** | `` (vide) | Production | **Jamais 1 en prod** |
| **AUTH_DEV_FILE** | `` (vide) | Production | **Jamais 1 en prod** |
| **RAPPEL_PREUVES_DEPUIS** | `2026-10-03` | Production | Démarrage progressif des relances de pièces |
| **TRAVAUX_OPENDATA_BASES** | `` / URL | Production | Optionnel — base(s) travaux routiers |
| **SUPABASE_URL** | `https://<ref>.supabase.co` | Production | Lecture health full |
| **SUPABASE_ANON_KEY** | `sb_...` | Production | Lecture health full |

---

## 🗄️ Phase 2 : Migrations Base de Données

### Option A : Via Vercel (Recommandé - Auto au deploy)

Le script `vercel-build` lance automatiquement :
```bash
# Dans vercel.json → "vercel-build": "node scripts/vercel-build.mjs"
# Qui exécute : prisma migrate deploy (si VERCEL_ENV=production)
```

### Option B : Manuel (si besoin)

```bash
# En local avec DATABASE_URL de prod
export DATABASE_URL="postgresql://user:pass@db.xxx.supabase.co:5432/postgres?schema=public"
export DIRECT_URL="postgresql://user:pass@db.xxx.supabase.co:5432/postgres?schema=public"

# Vérifier statut
npx prisma migrate status

# Déployer migrations
npx prisma migrate deploy

# Ou reset complet (DEV ONLY - JAMAIS EN PROD)
# npx prisma migrate reset --force
```

### Vérification Post-Migration

```bash
# Vérifier tables créées
psql "$DATABASE_URL" -c "\dt"

# Vérifier migrations appliquées
psql "$DATABASE_URL" -c "SELECT * FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;"
```

---

## 🚀 Phase 3 : Déploiement Vercel

### Option A : Push sur main (Auto)

```bash
git push origin main
```

Le workflow GitHub Actions :
1. ✅ Quality checks (lint, typecheck)
2. ✅ Unit tests (950+ tests)
3. ✅ E2E tests (Playwright)
4. ✅ Security scan
5. ✅ Docker build
6. ✅ **Preview deployment** (PR) ou **Production deployment** (main)

### Option B : CLI Manuel

```bash
# Build local vérification
npm run build

# Deploy preview
vercel --token=$VERCEL_TOKEN

# Deploy production
vercel --prod --token=$VERCEL_TOKEN
```

---

## ✅ Phase 4 : Vérifications Post-Deploy

### 1. Health Checks
```bash
# Health lite (public)
curl https://recours-permis-pv.com/api/health

# Health full (avec secret)
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://recours-permis-pv.com/api/health | jq .
```

### 2. Vérifications Critiques
| Check | Commande | Attendu |
|-------|----------|---------|
| Homepage | `curl -I https://recours-permis-pv.com` | `200 OK` |
| Login | `curl https://recours-permis-pv.com/login` | Page login |
| Dashboard | `curl -H "Cookie: ..." https://recours-permis-pv.com/dashboard` | `200 OK` |
| API Health | `curl https://recours-permis-pv.com/api/health` | `{"status":"healthy"}` |
| Métriques | `curl https://recours-permis-pv.com/api/metrics` | Prometheus format |

### 3. Test Flux Complet (Smoke Test)
```bash
# 1. Créer compte test
# 2. Déposer PV mock
# 3. Vérifier analyse OCR
# 4. Vérifier paiement (mock)
# 5. Vérifier signature
# 6. Vérifier envoi juriste
```

### 4. Monitoring
```bash
# Prometheus metrics
curl https://recours-permis-pv.com/api/metrics | head -50

# Sentry
open https://sentry.io/organizations/sos-amende/issues/

# Vercel Analytics
open https://vercel.com/dashboard
```

---

## 🔄 Phase 5 : Rollback Plan (Si Problème)

```bash
# Rollback rapide (< 2 min)
vercel rollback <deployment-url> --token=$VERCEL_TOKEN

# Ou promouvoir déploiement précédent
vercel promote <previous-deployment-url> --token=$VERCEL_TOKEN

# Si migration DB problème
# 1. Rollback code
# 2. Si migration appliquée : pas de rollback DB facile
#    → Corriger en avant (forward fix) + nouvelle migration
```

---

## 📞 Contacts Urgence

| Rôle | Contact | Disponibilité |
|------|---------|---------------|
| Platform On-call | @platform-oncall (Slack) | 24/7 |
| Team Lead | @team-lead | Jours ouvrés |
| Engineering Manager | @eng-manager | Jours ouvrés |
| Supabase Support | support@supabase.com | Enterprise |
| Vercel Support | vercel.com/support | Pro/Enterprise |

---

## 📋 Checklist Finale (Cocher avant Go-Live)

- [ ] Toutes variables Vercel configurées (55+ variables)
- [ ] `DATABASE_URL` = URL runtime (pooler 6543 recommandé) + `DIRECT_URL` = directe 5432
- [ ] `AUTH_RESEND_KEY` = clé valide domaine vérifié
- [ ] `STORAGE_DRIVER=s3` + credentials S3 valides
- [ ] `NEXT_PUBLIC_RIB_*` = vrais RIB (pas démo)
- [ ] `OCR_PROVIDER` = `mistral-ocr` ou `gemini-flash` avec clé
- [ ] `RATE_LIMIT_STORE=postgres`
- [ ] `CRON_SECRET` généré
- [ ] `SENTRY_DSN` configuré
- [ ] `ANTAI_MOCK=0`, `ANTAI_REAL=0`, `DRY_RUN=1`
- [ ] `SUPABASE_URL` / `SUPABASE_ANON_KEY` renseignés (health full)
- [ ] Scripts `npm test`, `npm run typecheck`, `npm run test:e2e` disponibles
- [ ] Migration `prisma migrate deploy` OK
- [ ] Deploy Vercel réussi
- [ ] Health checks OK
- [ ] Smoke test flux complet OK
- [ ] Monitoring Sentry/Grafana actif

---

**🎯 Une fois tout coché : GO LIVE !**
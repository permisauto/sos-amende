# 🚀 Checklist de Déploiement Production - SOS Amende

> **Prérequis :** Repository pushé sur `main`, Vercel connecté, Supabase project créé

---

## 📋 Phase 1 : Variables d'Environnement (Vercel Dashboard)

### Aller dans : **Vercel → Project → Settings → Environment Variables**

| Variable | Valeur | Environnement | Notes |
|----------|--------|---------------|-------|
| **DATABASE_URL** | `postgresql://user:pass@db.xxx.supabase.co:5432/postgres?schema=public` | Production | **Direct connection** (port 5432), pas pooler 6543 |
| **DIRECT_URL** | `postgresql://user:pass@db.xxx.supabase.co:5432/postgres?schema=public` | Production | Même que DATABASE_URL pour migrations |
| **AUTH_SECRET** | `openssl rand -base64 32` | Production | Générer : `openssl rand -base64 32` |
| **AUTH_RESEND_KEY** | `re_...` | Production | Clé Resend (domaine vérifié) |
| **EMAIL_FROM** | `SOS Amende <no-reply@votre-domaine.com>` | Production | Domaine vérifié sur Resend |
| **NEXT_PUBLIC_APP_URL** | `https://recours-permis-pv.com` | Production | URL canonique |
| **AUTH_URL** | `https://recours-permis-pv.com` | Production | Pour NextAuth v5 |
| **SUPER_ADMIN_EMAIL** | `admin@votre-domaine.com` | Production | Premier admin auto-promus |
| **REDIS_URL** | `redis://default:password@host:port` | Production | Upstash / Redis Cloud / Self-hosted |
| **STORAGE_DRIVER** | `s3` | Production | **Obligatoire en prod** |
| **STORAGE_BUCKET** | `sos-amende-prod` | Production | Nom bucket S3 (Scaleway/OVH/AWS) |
| **STORAGE_REGION** | `fr-par` / `eu-west-1` | Production | Région bucket |
| **STORAGE_ENDPOINT** | `https://s3.fr-par.scw.cloud` | Production | Endpoint S3-compatible |
| **STORAGE_ACCESS_KEY** | `SCW...` | Production | Access key S3 |
| **STORAGE_SECRET_KEY** | `...` | Production | Secret key S3 |
| **RIB_IBAN** | `FR76...` | Production | IBAN réel (pas démo) |
| **RIB_BIC** | `BANKFRPP` | Production | BIC réel |
| **RIB_TITULAIRE** | `SOS AMENDE SAS` | Production | Titulaire compte |
| **RIB_BANQUE** | `Banque Populaire` | Production | Nom banque |
| **NEXT_PUBLIC_RIB_IBAN** | `FR76...` | Production | Pour affichage client |
| **NEXT_PUBLIC_RIB_BIC** | `BANKFRPP` | Production | Pour affichage client |
| **NEXT_PUBLIC_RIB_TITULAIRE** | `SOS AMENDE SAS` | Production | Pour affichage client |
| **OCR_PROVIDER** | `mistral-ocr` | Production | Ou `gemini-flash` si clé dispospo |
| **MISTRAL_API_KEY** | `...` | Production | Si `mistral-ocr` |
| **GEMINI_API_KEY** | `...` | Production | Si `gemini-flash` |
| **GEMINI_MODEL** | `gemini-3.6-flash` | Production | Modèle Gemini |
| **VERIF_IA_PROVIDER** | `gemini` | Production | Pour vérification failles |
| **GEMINI_QUOTA_JOUR** | `100` | Production | Quota Gemini (défaut 20) |
| **GEMINI_PART_EXTRACTION** | `20` | Production | Part extraction (défaut 5) |
| **SIRET_PROVIDER** | `` (vide) | Production | API publique gratuite |
| **RATE_LIMIT_STORE** | `postgres` | Production | **Obligatoire en prod** pour rate-limit distribué |
| **CRON_SECRET** | `openssl rand -base64 32` | Production | Pour endpoints `/api/cron/*` |
| **SENTRY_DSN** | `https://...@sentry.io/...` | Production | DSN Sentry |
| **SENTRY_ORG** | `votre-org` | Production | Org Sentry |
| **SENTRY_PROJECT** | `sos-amende` | Production | Projet Sentry |
| **SENTRY_AUTH_TOKEN** | `...` | Production | Token Sentry pour sourcemaps |
| **ANTAI_MOCK** | `0` | Production | **0 = portail réel** |
| **ANTAI_REAL** | `1` | Production | Activer RPA réel (optionnel) |
| **ANTAI_URL** | `https://usagers.antai.gouv.fr` | Production | Portail ANTAI réel |
| **ANTAI_LOGIN** | `...` | Production | Compte service ANTAI |
| **ANTAI_PASSWORD** | `...` | Production | Mot de passe service |
| **ENABLE_DEV_LOGIN** | `` (vide) | Production | **Jamais 1 en prod** |
| **AUTH_DEV_FILE** | `` (vide) | Production | **Jamais 1 en prod** |
| **RAPPEL_PREUVES_DEPUIS** | `2026-10-03` | Production | Date mise en service |

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

- [ ] Toutes variables Vercel configurées (35+ variables)
- [ ] `DATABASE_URL` = connexion directe Supabase (port 5432)
- [ ] `AUTH_RESEND_KEY` = clé valide domaine vérifié
- [ ] `STORAGE_DRIVER=s3` + credentials S3 valides
- [ ] `RIB_*` = vrais RIB (pas démo)
- [ ] `OCR_PROVIDER` = `mistral-ocr` ou `gemini-flash` avec clé
- [ ] `RATE_LIMIT_STORE=postgres`
- [ ] `CRON_SECRET` généré
- [ ] `SENTRY_DSN` configuré
- [ ] `ANTAI_MOCK=0` (portail réel)
- [ ] Migration `prisma migrate deploy` OK
- [ ] Deploy Vercel réussi
- [ ] Health checks OK
- [ ] Smoke test flux complet OK
- [ ] Monitoring Sentry/Grafana actif

---

**🎯 Une fois tout coché : GO LIVE !**
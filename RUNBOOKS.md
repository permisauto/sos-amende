# Runbooks — SOS Amende

Procédures opérationnelles pour incidents courants.

---

## 1. Déploiement

### Déploiement standard (Vercel)
1. Push sur `main` → Vercel déploie automatiquement
2. `vercel-build` exécute `prisma migrate deploy` (si `VERCEL_ENV=production`)
3. `next build` compile l'application
4. Vérifier le déploiement : `/api/health` retourne `200`

### Rollback
```bash
# Vercel CLI
vercel rollback [deployment-url]

# Ou via dashboard Vercel → Deployments → "Promote to Production" sur l'ancien déploiement
```

---

## 2. Incidents base de données

### Connexion Prisma échoue (P1001, P1008, P1017)
**Symptômes** : `/api/health` → `prisma: unhealthy`, erreurs 500 sur pages dashboard.

**Diagnostic** :
```bash
# Vérifier DATABASE_URL
# Vérifier Supabase status (dashboard.supabase.com)
# Vérifier pooler (port 6543 vs 5432)
```

**Actions** :
1. Si Supabase en maintenance → attendre restauration
2. Si TLS error → vérifier certificats, redémarrer conteneurs Vercel
3. Si quota connections dépassé → réduire `connection_limit` ou migrer vers pooler transactionnel

### Migration échouée en prod
**Symptômes** : `vercel-build` échoue à `prisma migrate deploy`.

**Actions** :
1. Ne JAMAIS faire `db push` en prod
2. Créer migration locale : `npx prisma migrate dev --name fix_xxx`
3. Commit + push → Vercel réessaie au déploiement suivant
4. Si urgence : appliquer migration manuellement via Supabase SQL Editor, puis marquer comme appliquée : `INSERT INTO _prisma_migrations ...`

---

## 3. Incidents OCR

### Provider OCR indisponible
**Symptômes** : `/api/health` → `ocr: unhealthy`, uploads bloqués sur "Lecture automatique...".

**Actions** :
1. Vérifier `OCR_PROVIDER` et clés API (`GOOGLE_VISION_KEY`, `MISTRAL_API_KEY`, `GEMINI_API_KEY`)
2. Basculer sur provider de secours : modifier `OCR_PROVIDER` dans Vercel env vars → redéployer
3. Provider `mock` en dernier recours (texte fictif, bannière "Simulation" côté client)

### Tesseract.js worker manquant en prod
**Symptômes** : Erreur "Cannot find module .../worker-script/...".

**Cause** : `outputFileTracingIncludes` incomplet dans `next.config.ts`.

**Fix** : Ajouter les chemins manquants dans `outputFileTracingIncludes` → rebuild.

---

## 4. Incidents Email (Resend)

### Emails non envoyés
**Symptômes** : Magic-link non reçu, notifications status non reçues.

**Diagnostic** :
```bash
# Vérifier AUTH_RESEND_KEY (format re_xxx)
# Vérifier EMAIL_FROM (domaine vérifié sur Resend)
# Vérifier logs Resend (dashboard.resend.com)
```

**Actions** :
1. Si domaine non vérifié → utiliser domaine vérifié ou sandbox (limité aux emails testés)
2. Si quota dépassé → upgrader plan Resend
3. En dev : `AUTH_DEV_FILE=1` + `ANTAI_MOCK=1` écrit magic-link dans `node_modules/.cache/`

---

## 5. Incidents Stockage (S3/local)

### Fichiers non accessibles
**Symptômes** : PDF lettres, signatures, PV retournent 404.

**Local** : Vérifier `public/uploads/` permissions, espace disque.
**S3** : Vérifier `STORAGE_BUCKET`, `STORAGE_REGION`, credentials, bucket policy (public read pour lettres signées).

---

## 6. Incidents Cron

### Cron non exécutés
**Symptômes** : Rappels J-10/J-3/J-0 non envoyés, décisions non récupérées, veille non lancée.

**Diagnostic** :
- Vérifier `CRON_SECRET` défini
- Vérifier Vercel Cron tab (dashboard Vercel → Cron Jobs)
- Logs : `/api/cron/rappels`, `/api/cron/recuperations-decisions`, etc.

**Actions** :
1. Déclencher manuellement : `curl -H "Authorization: Bearer $CRON_SECRET" https://app/api/cron/rappels`
2. Vérifier timeout (max 300s sur Vercel Hobby) → optimiser requêtes lentes

---

## 7. Incidents ANTAI / Télérecours

### Mock ANTAI activé en prod
**Symptômes** : Erreur "ANTAI_MOCK=1 interdit en production" au démarrage.

**Fix** : Retirer `ANTAI_MOCK=1` des variables Vercel Production.

### RPA Playwright échoue
**Symptômes** : Soumission réelle échoue, logs "RPA ANTAI échoué".

**Actions** : Vérifier sélecteurs portail (peuvent changer), credentials `ANTAI_URL/LOGIN/PASSWORD`.

---

## 8. Sauvegarde & Restauration

### Supabase Point-in-Time Recovery (PITR)
- Rétention : 7 jours (plan gratuit) / 30 jours (plan payant)
- Restauration : Dashboard Supabase → Database → Backups → "Restore"
- Choisir timestamp → nouvelle branche → tester → pointer `DATABASE_URL` vers nouvelle branche

### Export données (RGPD)
- Endpoint : `GET /api/rgpd/export` (auth requis)
- Contenu : Profil, dossiers, OCR, événements, paiements, messages, preuves virement
- Exclus : passwordHash, tokens, liens dépôt hachés

### Purge RGPD
- `LienDepot` expirés > 30j : cron `/api/cron/rappels` (auto)
- Comptes supprimés : cascade Prisma + `storageDelete` best-effort

---

## 9. Contacts & Escalade

| Niveau | Contact | Délai |
|--------|---------|-------|
| P0 (prod down) | Lead dev + CTO | < 15 min |
| P1 (fonction critique) | Lead dev | < 1h |
| P2 (dégradé) | Dev de garde | < 4h |
| P3 (mineur) | Backlog | Sprint suivant |

---

## 10. Variables d'environnement critiques (Prod)

| Variable | Requis | Description |
|----------|--------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL Supabase (port 5432 direct) |
| `AUTH_SECRET` | ✅ | `openssl rand -base64 32` |
| `AUTH_RESEND_KEY` | ✅ | Clé Resend `re_xxx` |
| `EMAIL_FROM` | ✅ | Domaine vérifié Resend |
| `NEXT_PUBLIC_APP_URL` | ✅ | URL canonique (ex: `https://sos-amende.fr`) |
| `OCR_PROVIDER` | ✅ | `google-vision` / `mistral-ocr` / `tesseract` |
| Clés OCR correspondantes | ✅ | Selon provider |
| `STORAGE_DRIVER` | ✅ | `s3` (prod) |
| `STORAGE_BUCKET/REGION/ENDPOINT/ACCESS_KEY/SECRET_KEY` | ✅ | Bucket S3-compatible UE |
| `CRON_SECRET` | ✅ | Secret partagé pour crons |
| `SENTRY_DSN/ORG/PROJECT/AUTH_TOKEN` | ⭕ | Monitoring erreurs |
| `ANTAI_MOCK_TOKEN` | ❌ | Jamais en prod |

---

*Dernière mise à jour : 2026-10-25*
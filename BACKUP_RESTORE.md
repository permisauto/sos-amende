# Procédure de Sauvegarde & Restauration — SOS Amende

---

## 1. Stratégie de sauvegarde

| Composant | Fréquence | Rétention | Méthode |
|-----------|-----------|-----------|---------|
| Base de données (Supabase) | Continue (PITR) | 7j (gratuit) / 30j (payant) | WAL-G / pg_basebackup |
| Fichiers uploads (S3) | Quotidien | 90j | Versioning S3 + réplication cross-region |
| Configuration (Vercel) | À chaque déploiement | Illimitée | Git + Vercel dashboard |
| Secrets (Vercel) | Manuel | Illimitée | Gestionnaire de secrets Vercel / 1Password |

---

## 2. Sauvegarde base de données (Supabase)

### Point-in-Time Recovery (PITR)
- **Activé par défaut** sur Supabase (tous les plans)
- **Granularité** : seconde près
- **Rétention** : 7 jours (plan gratuit), 30 jours (Pro), 90 jours (Enterprise)

### Restauration PITR
```bash
# Via Dashboard Supabase
1. Database → Backups → "Restore"
2. Choisir timestamp (ex: 2026-10-25 14:30:00)
3. Nom de la nouvelle branche : `restore-20261025-1430`
4. Lancer la restauration (5-30 min selon taille)
5. Tester la branche restaurée
6. Mettre à jour DATABASE_URL Vercel vers nouvelle branche
```

### Backup manuel (export SQL)
```bash
# Depuis local (nécessite pg_dump + accès direct port 5432)
pg_dump "postgresql://user:pass@host:5432/postgres?schema=public" \
  --no-owner --no-privileges --clean --if-exists \
  > backup_$(date +%Y%m%d_%H%M%S).sql

# Restauration
psql "postgresql://user:pass@host:5432/postgres?schema=public" < backup_20261025.sql
```

> ⚠️ **Port 5432 direct requis** pour `pg_dump` / migrations. Le pooler transactionnel (port 6543) ne supporte pas les verrous de session.

---

## 3. Sauvegarde fichiers (S3)

### Configuration recommandée
- **Bucket** : Versioning activé
- **Lifecycle** :
  - Current version : 90 jours
  - Non-current versions : 30 jours
  - Incomplete multipart uploads : 7 jours
- **Réplication** : Cross-region (ex: eu-west-1 → eu-central-1)
- **Chiffrement** : SSE-S3 (AES-256) minimum, SSE-KMS recommandé

### Restauration fichier
```bash
# Via AWS CLI (ou équivalent Scaleway/OVH)
aws s3 cp s3://bucket/uploads/xxx.pdf ./restored.pdf --version-id <version-id>

# Ou via dashboard S3 → Versions → "Restore"
```

---

## 4. Sauvegarde configuration & secrets

### Vercel
- **Environment Variables** : Exportables via Vercel CLI
  ```bash
  vercel env ls --prod > env-backup.txt
  ```
- **Deployments** : Historique complet dans dashboard Vercel

### Secrets sensibles (non dans Vercel)
- Stockés dans **1Password** (ou Bitwarden/Keepass)
- Accès : Lead dev + CTO seulement
- Rotation : Tous les 90 jours (AUTH_SECRET, CRON_SECRET, clés API)

---

## 5. Procédure de restauration complète (Disaster Recovery)

### Scénario : Perte totale région primaire

**RTO cible** : < 2h  
**RPO cible** : < 1h (PITR)

### Étapes
1. **Base de données** : Restaurer PITR vers timestamp T-1h sur nouvelle région
2. **DNS** : Basculer `NEXT_PUBLIC_APP_URL` vers nouveau déploiement Vercel (preview → production)
3. **Stockage** : Bucket S3 déjà répliqué cross-region → accessible
4. **Secrets** : Récupérer depuis 1Password → configurer sur nouveau Vercel
5. **Tests smoke** :
   - `/api/health` → 200
   - Login magic-link → dashboard accessible
   - Upload PV → analyse → lettre générée
   - Paiement virement → admin valide → crédit débloqué
6. **Communication** : Informer utilisateurs (bannière maintenance, email si > 30min)

---

## 6. Tests de restauration (Obligatoires)

| Test | Fréquence | Responsable | Critère succès |
|------|-----------|-------------|----------------|
| Restore PITR (échantillon) | Mensuel | Lead dev | DB restaurée < 30min, données cohérentes |
| Restore fichier S3 (aléatoire) | Mensuel | DevOps | Fichier identique (hash SHA256) |
| Rotation secrets | Trimestriel | Lead dev | Nouveaux secrets fonctionnels |
| Failover DNS | Semestriel | CTO | Basculement < 5min |

### Checklist test mensuel
- [ ] Choisir timestamp aléatoire J-3
- [ ] Restaurer branche `test-restore-YYYYMMDD`
- [ ] Vérifier 5 dossiers aléatoires (données + PDF lettres)
- [ ] Vérifier 3 paiements (statuts, preuves virement)
- [ ] Vérifier 2 users (rôles, crédits, signatures)
- [ ] Documenter durée + anomalies
- [ ] Supprimer branche de test

---

## 7. Contacts urgence

| Rôle | Nom | Contact |
|------|-----|---------|
| Lead Dev | — | — |
| CTO | — | — |
| Supabase Support | — | support@supabase.com |
| Vercel Support | — | support@vercel.com |
| S3 Provider (Scaleway/OVH) | — | — |

---

*Document à maintenir à jour à chaque changement d'infrastructure.*  
*Dernière révision : 2026-10-25*
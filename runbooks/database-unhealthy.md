# Runbook: Database Unhealthy

## Alert: DatabaseUnhealthy

**Severity:** Critical  
**Team:** Platform  
**Escalation:** Page on-call immediately

---

## Symptoms
- Health check `/api/health` returns `unhealthy` for `prisma` check
- Prisma connection errors in application logs
- Database queries timing out or failing

---

## Diagnosis Steps

### 1. Check Supabase Status
```bash
# Check Supabase status page
open https://status.supabase.com/

# Check project health
curl -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  https://<project-ref>.supabase.co/rest/v1/
```

### 2. Test Direct Connection
```bash
# Test with psql
psql "$DATABASE_URL" -c "SELECT 1;"

# Test with Prisma
npx prisma db pull --preview-feature
```

### 3. Check Supabase Dashboard
```bash
# Open Supabase dashboard
open https://supabase.com/dashboard/project/<project-id>

# Check:
# - Database size / quota
# - Connection count
# - Long-running queries
# - Replication lag
```

### 4. Check Application Logs
```bash
# Vercel logs
vercel logs <deployment-url> --token=$VERCEL_TOKEN --since=1h | grep -i prisma

# Sentry
open https://sentry.io/organizations/sos-amende/issues/?query=prisma
```

---

## Common Causes & Fixes

| Cause | Symptom | Fix |
|-------|---------|-----|
| **Supabase maintenance** | Scheduled maintenance window | Check status page, wait for completion |
| **Connection pool exhausted** | "Too many connections" error | Increase pool size, fix connection leaks |
| **SSL/TLS certificate issue** | "Self-signed certificate" error | Update `DATABASE_URL` to use direct connection |
| **Database size quota exceeded** | "Disk full" errors | Upgrade plan or clean up data |
| **Long-running query** | Query timeouts | Check `pg_stat_activity`, kill long queries |
| **Migration failed** | Schema drift | Run `npx prisma migrate deploy` manually |

---

## Immediate Actions

### 1. Force Reconnect
```bash
# Restart Vercel deployment
vercel rollback <deployment-url> --token=$VERCEL_TOKEN

# Or trigger new deployment
vercel --prod --token=$VERCEL_TOKEN
```

### 2. Kill Long-Running Queries
```sql
-- In Supabase SQL editor
SELECT pid, query_start, state, query 
FROM pg_stat_activity 
WHERE state = 'active' 
  AND query_start < now() - interval '5 minutes';

-- Kill specific query
SELECT pg_terminate_backend(<pid>);
```

### 3. Check Connection Pool
```sql
-- Check current connections
SELECT count(*) FROM pg_stat_activity WHERE datname = current_database();

-- Check max connections
SHOW max_connections;
```

---

## Supabase-Specific Issues

### TLS Certificate Issues (Historical)
**Problem:** "Self-signed certificate in certificate chain"  
**Fix:** Ensure `DATABASE_URL` uses direct connection (port 5432), not pooler (port 6543)

```bash
# Good (direct)
postgresql://user:pass@db.xxx.supabase.co:5432/postgres

# Bad (pooler with TLS issues)
postgresql://user:pass@aws-0-eu-west-1.pooler.supabase.com:6543/postgres
```

### Migration Issues
```bash
# Check migration status
npx prisma migrate status

# Deploy pending migrations
npx prisma migrate deploy

# Reset if needed (DEV ONLY)
npx prisma migrate reset --force
```

---

## Escalation Path

1. **On-call Platform Engineer** (immediate)
2. **Supabase Support** (if infrastructure issue)
3. **Team Lead** (if not resolved in 15 min)
4. **Engineering Manager** (if not resolved in 30 min)

---

## Post-Incident

1. Document root cause in incident report
2. Check if connection pooling config needs adjustment
3. Review query performance (add indexes if needed)
4. Update runbook if new failure mode discovered

---

## Related Dashboards
- [Supabase Dashboard](https://supabase.com/dashboard)
- [Vercel Logs](https://vercel.com/dashboard)
- [Sentry](https://sentry.io/organizations/sos-amende/issues/)
- [Grafana](https://grafana.sos-amende.com/d/database)

---

## Contacts
- **Platform On-call:** @platform-oncall (Slack)
- **Supabase Support:** support@supabase.com (Enterprise)
- **Team Lead:** @team-lead
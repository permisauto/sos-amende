# Runbook: Service Down

## Alert: ServiceDown

**Severity:** Critical  
**Team:** Platform  
**Escalation:** Page on-call immediately

---

## Symptoms
- `/api/health` returns non-200 status
- Application not responding to requests
- Monitoring shows `up{job="sos-amende"} == 0`

---

## Diagnosis Steps

### 1. Check Vercel Deployment Status
```bash
# Check Vercel dashboard
open https://vercel.com/dashboard

# Or via CLI
vercel inspect <deployment-url> --token=$VERCEL_TOKEN
```

### 2. Check Supabase Connection
```bash
# Test database connectivity
psql "$DATABASE_URL" -c "SELECT 1;"

# Or via Supabase dashboard
open https://supabase.com/dashboard/project/<project-id>
```

### 3. Check Recent Deployments
```bash
# Check last successful deployment
vercel list --token=$VERCEL_TOKEN | head -5

# Check deployment logs
vercel logs <deployment-url> --token=$VERCEL_TOKEN
```

### 4. Check Application Logs
```bash
# Vercel logs
vercel logs <deployment-url> --token=$VERCEL_TOKEN --since=1h

# Or check Sentry
open https://sentry.io/organizations/sos-amende/issues/
```

---

## Common Causes & Fixes

| Cause | Symptom | Fix |
|-------|---------|-----|
| **Vercel deployment failed** | Build errors in logs | Check build logs, fix compilation errors, redeploy |
| **Supabase connection failed** | TLS certificate errors | Check `DATABASE_URL` format, verify Supabase status page |
| **Environment variable missing** | App crashes on startup | Verify all required env vars in Vercel dashboard |
| **Prisma migration failed** | DB schema mismatch | Run `npx prisma migrate deploy` manually |
| **Out of memory** | OOM kills in logs | Increase Vercel function memory limit |

---

## Escalation Path

1. **On-call Platform Engineer** (immediate)
2. **Team Lead** (if not resolved in 15 min)
3. **Engineering Manager** (if not resolved in 30 min)
4. **CTO** (if not resolved in 1 hour)

---

## Post-Incident

1. Create incident report in Notion
2. Run post-mortem within 48 hours
3. Update runbook if new failure mode discovered
4. Add preventive monitoring if gap identified

---

## Related Dashboards
- [Vercel Dashboard](https://vercel.com/dashboard)
- [Supabase Dashboard](https://supabase.com/dashboard)
- [Sentry Issues](https://sentry.io/organizations/sos-amende/issues/)
- [Grafana Dashboard](https://grafana.sos-amende.com/d/sos-amende/overview)

---

## Contacts
- **Platform On-call:** @platform-oncall (Slack)
- **Team Lead:** @team-lead
- **Engineering Manager:** @eng-manager
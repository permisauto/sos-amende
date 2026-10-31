# Runbook: High Error Rate

## Alert: HighErrorRate

**Severity:** Critical  
**Team:** Platform  
**Escalation:** Page on-call immediately

---

## Symptoms
- Alert: `HighErrorRate` firing
- Error rate > 5% for 5+ minutes
- Increased 5xx responses in HTTP requests
- Sentry spike in errors

---

## Diagnosis Steps

### 1. Identify Error Pattern
```bash
# Check Sentry for error grouping
open https://sentry.io/organizations/sos-amende/issues/

# Filter by:
# - Level: Error
# - Time: Last 30 minutes
# - Group by: Error type / endpoint
```

### 2. Check HTTP Error Breakdown
```bash
# Prometheus query
sum(rate(http_requests_total{status_code=~"5.."}[5m])) by (route, status_code)
```

### 3. Check Recent Deployments
```bash
# Check if recent deployment correlates
vercel list --token=$VERCEL_TOKEN | head -10

# Check deployment time vs error spike
```

### 3. Check Specific Error Types
```bash
# Common error patterns:
# - Prisma connection errors
# - OCR provider failures
# - External API timeouts
# - Validation errors
# - Authentication failures
```

---

## Common Causes & Fixes

| Cause | Error Pattern | Fix |
|-------|---------------|-----|
| **Bad deployment** | Errors spike after deploy | Rollback: `vercel rollback` |
| **Database connection pool exhausted** | Prisma connection errors | Restart deployment, check connection leaks |
| **External API down** | OCR/Groq/Resend errors | Check vendor status, enable fallbacks |
| **Rate limiting too aggressive** | 429 errors spike | Adjust rate limits |
| **Bad input validation** | 400 errors spike | Check validation logic |
| **Memory leak** | OOM kills, then 500s | Restart deployment, investigate leak |

---

## Immediate Actions

### 1. Rollback if Recent Deploy
```bash
# Quick rollback
vercel rollback <deployment-url> --token=$VERCEL_TOKEN

# Or promote previous deployment
vercel promote <previous-deployment-url> --token=$VERCEL_TOKEN
```

### 2. Check Circuit Breakers
```bash
# Check if any circuit breakers are OPEN
curl -s https://recours-permis-pv.com/api/health | jq '.checks[] | select(.name=="circuit_breakers")'
```

### 3. Restart Deployment (Last Resort)
```bash
# Force new deployment
vercel --prod --token=$VERCEL_TOKEN
```

### 4. Enable Maintenance Mode (If Critical)
```bash
# Set maintenance mode env var in Vercel
# MAINTENANCE_MODE=true
# Then redeploy
```

---

## Error Type Specific Actions

### Prisma/Database Errors
```
Error: P1001: Can't reach database server
```
→ Check database connectivity, restart deployment

```
Error: P2024: Connection pool exhausted
```
→ Restart deployment, check for connection leaks

### OCR Errors
```
Error: OCR provider unavailable
```
→ Check circuit breaker, switch provider

### External API Errors
```
Error: External API timeout
```
→ Check circuit breaker, increase timeout

### Authentication Errors
```
Error: JWT expired / invalid
```
→ Check AUTH_SECRET, clock sync

---

## Escalation Path

1. **On-call Platform Engineer** (immediate)
2. **Team Lead** (if not resolved in 10 min)
3. **Engineering Manager** (if not resolved in 20 min)
4. **CTO** (if not resolved in 45 min)

---

## Post-Incident

1. Create incident timeline in Notion
2. Identify root cause (5 Whys)
3. Create action items for prevention
4. Update runbook with new findings
5. Schedule post-mortem within 48 hours

---

## Related Alerts
- `ServiceDown` - if error rate reaches 100%
- `CircuitBreakerOpen` - often correlates
- `DatabaseUnhealthy` - may be root cause

---

## Contacts
- **Platform On-call:** @platform-oncall (Slack)
- **Team Lead:** @team-lead
- **Engineering Manager:** @eng-manager
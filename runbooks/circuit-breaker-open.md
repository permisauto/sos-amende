# Runbook: Circuit Breaker OPEN

## Alert: CircuitBreakerOpen

**Severity:** Critical  
**Team:** Platform  
**Escalation:** Page on-call immediately

---

## Symptoms
- Alert: `CircuitBreakerOpen` firing
- Circuit breaker state is `OPEN` for one or more external services
- External API calls failing fast with circuit breaker errors

---

## Affected Circuits
| Circuit | External Service | Impact |
|---------|------------------|--------|
| `ocr` | Google Vision / Mistral / Gemini | OCR processing fails |
| `groq` | Groq LLM API | AI verification fails |
| `open-meteo` | Open-Meteo API | Weather proof retrieval fails |
| `ban` | API Adresse (BAN) | Address geocoding fails |
| `travaux` | OpendataSoft | Roadworks proof fails |
| `data-gouv` | data.gouv.fr | Radar database fails |
| `resend` | Resend Email | Email notifications fail |
| `storage` | S3-compatible | File uploads/downloads fail |

---

## Diagnosis Steps

### 1. Identify Affected Circuit
```bash
# Check circuit breaker metrics
curl -s http://localhost:9090/api/v1/query?query=circuit_breaker_state

# Or check health endpoint
curl -s https://recours-permis-pv.com/api/health | jq '.checks[] | select(.name=="circuit_breakers")'
```

### 2. Check External Service Status
```bash
# Check specific service
# For OCR (Google Vision)
curl -H "Authorization: Bearer $GOOGLE_VISION_KEY" \
  https://vision.googleapis.com/v1/images:annotate

# For Groq
curl -H "Authorization: Bearer $GROQ_API_KEY" \
  https://api.groq.com/openai/v1/models

# For Resend
curl -H "Authorization: Bearer $RESEND_KEY" \
  https://api.resend.com/emails
```

### 3. Check Circuit Breaker Metrics
```bash
# Get detailed metrics
curl -s http://localhost:9090/api/v1/query?query=circuit_breaker_state_changes_total
```

---

## Common Causes & Fixes

| Circuit | Cause | Fix |
|---------|-------|-----|
| `ocr` | Google Vision quota exceeded | Check Google Cloud quota, enable billing, or switch to Mistral |
| `ocr` | Mistral API down | Check Mistral status page, fallback to Gemini |
| `groq` | Rate limit exceeded | Wait for reset, implement exponential backoff |
| `open-meteo` | API timeout | Increase timeout, check network connectivity |
| `ban` | BAN API rate limited | Implement caching, reduce request frequency |
| `travaux` | OpendataSoft down | Check status page, use fallback data |
| `data-gouv` | data.gouv.fr unavailable | Use cached radar data, alert ops |
| `resend` | Invalid API key / quota | Verify Resend dashboard, check sending limits |
| `storage` | S3 credentials invalid | Verify credentials, check bucket policy |

---

## Immediate Actions

### 1. Force Close Circuit (Temporary)
```bash
# Via admin API (if available)
curl -X POST https://admin.sos-amende.com/api/admin/circuit-breaker/close \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"circuit": "ocr"}'
```

### 2. Switch to Fallback Provider
```bash
# For OCR: Switch to Mistral if Google Vision down
# In Vercel dashboard, update OCR_PROVIDER=mistral-ocr
```

### 3. Check Quota/Limits
```bash
# Google Vision
gcloud logging read "resource.type=vision.googleapis.com" --limit=50

# Resend
curl -H "Authorization: Bearer $RESEND_KEY" https://api.resend.com/domains
```

---

## Escalation Path

1. **On-call Platform Engineer** (immediate)
2. **Team Lead** (if not resolved in 15 min)
3. **Engineering Manager** (if not resolved in 30 min)
4. **External Vendor Support** (if vendor issue)

---

## Post-Incident

1. Document which circuit opened and why
2. Check if quota increases needed
3. Review circuit breaker thresholds (too sensitive?)
4. Update fallback provider configuration
5. Add preventive monitoring if gap identified

---

## Related Alerts
- `HighErrorRate` - often correlates
- `ExternalAPIDegraded` - precursor
- `HighLatency` - may indicate circuit breaker thrashing

---

## Contacts
- **Platform On-call:** @platform-oncall (Slack)
- **Vendor Contacts:** 
  - Google Cloud Support: Case in Cloud Console
  - Mistral: support@mistral.ai
  - Resend: support@resend.com
  - Supabase: support@supabase.com
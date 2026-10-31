/**
 * Prometheus Metrics - Métriques d'observabilité pour Prometheus
 * Exposé sur /api/metrics pour scraping Prometheus
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Registry global
const register = new Registry();

// Métriques par défaut Node.js (CPU, memory, event loop, etc.)
collectDefaultMetrics({ register, prefix: 'nodejs_' });

// ============================================
// MÉTRIQUES BUSINESS (SOS Amende)
// ============================================

// Compteurs
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const authAttemptsTotal = new Counter({
  name: 'auth_attempts_total',
  help: 'Total authentication attempts',
  labelNames: ['provider', 'result'], // result: success, failure, rate_limited
  registers: [register],
});

export const dossiersCreatedTotal = new Counter({
  name: 'dossiers_created_total',
  help: 'Total dossiers created',
  labelNames: ['type', 'source'], // type: AMENDE/SUSPENSION, source: web/api
  registers: [register],
});

export const dossiersStatusChangedTotal = new Counter({
  name: 'dossiers_status_changed_total',
  help: 'Total dossier status transitions',
  labelNames: ['from_status', 'to_status', 'actor'], // actor: client, juriste, system
  registers: [register],
});

export const paymentsCreatedTotal = new Counter({
  name: 'payments_created_total',
  help: 'Total payments initiated',
  labelNames: ['kind', 'amount_bucket'], // kind: AMENDE/SUSPENSION/CONTENTIEUX
  registers: [register],
});

export const paymentsValidatedTotal = new Counter({
  name: 'payments_validated_total',
  help: 'Total payments validated by admin',
  labelNames: ['kind'],
  registers: [register],
});

export const paymentsRefusedTotal = new Counter({
  name: 'payments_refused_total',
  help: 'Total payments refused by admin',
  labelNames: ['kind'],
  registers: [register],
});

export const ocrRequestsTotal = new Counter({
  name: 'ocr_requests_total',
  help: 'Total OCR requests',
  labelNames: ['provider', 'result'], // result: success, failure, timeout
  registers: [register],
});

export const circuitBreakerStateChanges = new Counter({
  name: 'circuit_breaker_state_changes_total',
  help: 'Circuit breaker state transitions',
  labelNames: ['circuit', 'from_state', 'to_state'],
  registers: [register],
});

export const cacheHitsTotal = new Counter({
  name: 'cache_hits_total',
  help: 'Cache hits',
  labelNames: ['cache_name'],
  registers: [register],
});

export const cacheMissesTotal = new Counter({
  name: 'cache_misses_total',
  help: 'Cache misses',
  labelNames: ['cache_name'],
  registers: [register],
});

export const dataloaderBatchesTotal = new Counter({
  name: 'dataloader_batches_total',
  help: 'DataLoader batch executions',
  labelNames: ['loader_name'],
  registers: [register],
});

export const externalApiCallsTotal = new Counter({
  name: 'external_api_calls_total',
  help: 'External API calls',
  labelNames: ['api', 'result'], // result: success, failure, timeout
  registers: [register],
});

export const emailsSentTotal = new Counter({
  name: 'emails_sent_total',
  help: 'Emails sent via Resend',
  labelNames: ['type', 'result'], // type: magic_link, notification, payment_confirmation
  registers: [register],
});

export const errorsTotal = new Counter({
  name: 'errors_total',
  help: 'Application errors',
  labelNames: ['type', 'severity'], // severity: error, warning
  registers: [register],
});

// Histogrammes (latence)
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const ocrDuration = new Histogram({
  name: 'ocr_duration_seconds',
  help: 'OCR processing duration in seconds',
  labelNames: ['provider'],
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
  registers: [register],
});

export const externalApiDuration = new Histogram({
  name: 'external_api_duration_seconds',
  help: 'External API call duration in seconds',
  labelNames: ['api'],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [register],
});

export const databaseQueryDuration = new Histogram({
  name: 'database_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation', 'model'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [register],
});

export const dataloaderBatchDuration = new Histogram({
  name: 'dataloader_batch_duration_seconds',
  help: 'DataLoader batch execution duration',
  labelNames: ['loader_name'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
  registers: [register],
});

// Jauges (états actuels)
export const activeUsersGauge = new Gauge({
  name: 'active_users',
  help: 'Currently active users (last 5 min)',
  registers: [register],
});

export const pendingDossiersGauge = new Gauge({
  name: 'pending_dossiers',
  help: 'Dossiers awaiting processing',
  labelNames: ['status'],
  registers: [register],
});

export const circuitBreakerState = new Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker current state (0=closed, 1=half_open, 2=open)',
  labelNames: ['circuit'],
  registers: [register],
});

export const cacheSizeGauge = new Gauge({
  name: 'cache_size',
  help: 'Current cache entries',
  labelNames: ['cache_name'],
  registers: [register],
});

export const queueDepthGauge = new Gauge({
  name: 'queue_depth',
  help: 'Background job queue depth',
  labelNames: ['queue_name'],
  registers: [register],
});

export const memoryUsageGauge = new Gauge({
  name: 'memory_usage_bytes',
  help: 'Process memory usage',
  labelNames: ['type'], // heap_used, heap_total, rss
  registers: [register],
});

// ============================================
// HELPERS
// ============================================

/**
 * Enregistre une requête HTTP
 */
export function recordHttpRequest(method: string, route: string, statusCode: number, durationMs: number) {
  httpRequestsTotal.inc({ method, route, status_code: statusCode.toString() });
  httpRequestDuration.observe({ method, route }, durationMs / 1000);
}

/**
 * Enregistre une tentative d'authentification
 */
export function recordAuthAttempt(provider: string, result: 'success' | 'failure' | 'rate_limited') {
  authAttemptsTotal.inc({ provider, result });
}

/**
 * Enregistre la création d'un dossier
 */
export function recordDossierCreated(type: 'AMENDE' | 'SUSPENSION', source: 'web' | 'api' = 'web') {
  dossiersCreatedTotal.inc({ type, source });
}

/**
 * Enregistre un changement de statut de dossier
 */
export function recordDossierStatusChange(
  fromStatus: string,
  toStatus: string,
  actor: 'client' | 'juriste' | 'system'
) {
  dossiersStatusChangedTotal.inc({ from_status: fromStatus, to_status: toStatus, actor });
}

/**
 * Enregistre un paiement
 */
export function recordPaymentCreated(kind: 'AMENDE' | 'SUSPENSION' | 'CONTENTIEUX', amount: number) {
  const bucket = amount < 50 ? 'small' : amount < 200 ? 'medium' : 'large';
  paymentsCreatedTotal.inc({ kind, amount_bucket: bucket });
}

/**
 * Enregistre une validation/رفض de paiement
 */
export function recordPaymentDecision(kind: string, validated: boolean) {
  if (validated) {
    paymentsValidatedTotal.inc({ kind });
  } else {
    paymentsRefusedTotal.inc({ kind });
  }
}

/**
 * Enregistre une requête OCR
 */
export function recordOcrRequest(provider: string, result: 'success' | 'failure' | 'timeout', durationMs: number) {
  ocrRequestsTotal.inc({ provider, result });
  ocrDuration.observe({ provider }, durationMs / 1000);
}

/**
 * Enregistre un appel API externe
 */
export function recordExternalApiCall(api: string, result: 'success' | 'failure' | 'timeout', durationMs: number) {
  externalApiCallsTotal.inc({ api, result });
  externalApiDuration.observe({ api }, durationMs / 1000);
}

/**
 * Enregistre un changement d'état circuit breaker
 */
export function recordCircuitBreakerChange(circuit: string, from: string, to: string) {
  circuitBreakerStateChanges.inc({ circuit, from_state: from, to_state: to });
  const stateMap = { closed: 0, half_open: 1, open: 2 };
  circuitBreakerState.set({ circuit }, stateMap[to as keyof typeof stateMap] ?? 0);
}

/**
 * Enregistre hit/miss cache
 */
export function recordCacheAccess(cacheName: string, hit: boolean) {
  if (hit) {
    cacheHitsTotal.inc({ cache_name: cacheName });
  } else {
    cacheMissesTotal.inc({ cache_name: cacheName });
  }
}

/**
 * Enregistre un batch DataLoader
 */
export function recordDataloaderBatch(loaderName: string, durationMs: number) {
  dataloaderBatchesTotal.inc({ loader_name: loaderName });
  dataloaderBatchDuration.observe({ loader_name: loaderName }, durationMs / 1000);
}

/**
 * Enregistre un email envoyé
 */
export function recordEmailSent(type: string, result: 'success' | 'failure') {
  emailsSentTotal.inc({ type, result });
}

/**
 * Enregistre une erreur
 */
export function recordError(type: string, severity: 'error' | 'warning' = 'error') {
  errorsTotal.inc({ type, severity });
}

/**
 * Met à jour les jauges système (appelé périodiquement)
 */
export function updateSystemGauges() {
  const mem = process.memoryUsage();
  memoryUsageGauge.set({ type: 'heap_used' }, mem.heapUsed);
  memoryUsageGauge.set({ type: 'heap_total' }, mem.heapTotal);
  memoryUsageGauge.set({ type: 'rss' }, mem.rss);
}

/**
 * Retourne toutes les métriques au format Prometheus
 */
export async function getMetrics(): Promise<string> {
  updateSystemGauges();
  return register.metrics();
}

/**
 * Retourne le content-type Prometheus
 */
export function getMetricsContentType(): string {
  return register.contentType;
}

// Export du registry pour tests
export { register };
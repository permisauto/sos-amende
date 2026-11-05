import { getMetrics, getMetricsContentType } from '@/lib/metrics';
import { verifierSecretCron } from '@/lib/cron-auth';

export async function GET(req: Request) {
  const auth = verifierSecretCron(req);
  if (auth === 'secret-absent') {
    return new Response('CRON_SECRET manquante : métriques non autorisées.', { status: 500 });
  }
  if (auth !== 'ok') {
    return new Response('Non autorisé', { status: 401 });
  }

  try {
    const metrics = await getMetrics();
    return new Response(metrics, {
      status: 200,
      headers: {
        'Content-Type': getMetricsContentType(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[METRICS] Error generating metrics:', error);
    return new Response('Error generating metrics', { status: 500 });
  }
}
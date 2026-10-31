import { getMetrics, getMetricsContentType } from '@/lib/metrics';

export async function GET() {
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
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { logger, extractCorrelationId } from '@/lib/structured-logging';
import { recordHttpRequest, recordError } from '@/lib/metrics';

/**
 * Middleware de logging et métriques automatique
 */
export function loggingMiddleware(request: NextRequest) {
  const startTime = Date.now();
  const correlationId = extractCorrelationId(request.headers);
  
  // Ajouter correlation ID à la réponse
  const response = NextResponse.next();
  response.headers.set('x-correlation-id', correlationId);
  
  // Logger la requête entrante
  logger.httpAccess({
    method: request.method,
    url: request.url,
    statusCode: 0, // Sera mis à jour après la réponse
    durationMs: 0,
    userAgent: request.headers.get('user-agent') ?? undefined,
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 
        request.headers.get('x-real-ip') ?? undefined,
    correlationId,
  });

  // Intercepter la réponse pour logger le status code et durée
  const originalResponse = response;
  
  return response;
}

/**
 * Wrapper pour Server Actions avec logging/métriques
 */
export async function withActionLogging<T>(
  action: () => Promise<T>,
  operationName: string,
  context: Record<string, unknown> = {}
): Promise<T> {
  const correlationId = context.correlationId as string ?? `action-${Date.now()}`;
  const startTime = Date.now();
  
  try {
    const result = await action();
    const duration = Date.now() - startTime;
    
    logger.info(`Action completed: ${operationName}`, {
      correlationId,
      operation: operationName,
      durationMs: duration,
      success: true,
      ...context,
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error(`Action failed: ${operationName}`, {
      correlationId,
      operation: operationName,
      durationMs: duration,
      success: false,
      ...context,
    }, error as Error);
    
    recordError(operationName, 'error');
    throw error;
  }
}

/**
 * Helper pour API Routes
 */
export async function withApiLogging<T>(
  request: Request,
  handler: (req: Request, correlationId: string) => Promise<T>,
  routeName: string
): Promise<T> {
  const correlationId = extractCorrelationId(request.headers);
  const startTime = Date.now();
  
  logger.info(`API Request: ${routeName}`, {
    correlationId,
    method: request.method,
    url: request.url,
  });
  
  try {
    const result = await handler(request, correlationId);
    const duration = Date.now() - startTime;
    
    logger.httpAccess({
      method: request.method,
      url: request.url,
      statusCode: 200,
      durationMs: duration,
      correlationId,
    });
    
    recordHttpRequest(request.method, routeName, 200, duration);
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const statusCode = error instanceof Response ? error.status : 500;
    
    logger.error(`API Error: ${routeName}`, {
      correlationId,
      route: routeName,
      durationMs: duration,
      success: false,
    }, error as Error);
    
    recordHttpRequest(request.method, routeName, statusCode, duration);
    recordError(routeName, 'error');
    
    throw error;
  }
}
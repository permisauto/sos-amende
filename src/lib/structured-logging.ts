/**
 * Structured Logging - Journalisation structurée avec correlation IDs
 * Format JSON pour ingestion Loki/ELK/Splunk
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  correlationId?: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Génère un correlation ID unique
 */
export function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Extrait le correlation ID des headers
 */
export function extractCorrelationId(headers: Headers): string {
  return (
    headers.get('x-correlation-id') ||
    headers.get('x-request-id') ||
    headers.get('x-trace-id') ||
    generateCorrelationId()
  );
}

/**
 * Logger principal
 */
class StructuredLogger {
  private serviceName: string;
  private defaultContext: LogContext = {};

  constructor(serviceName: string = 'sos-amende') {
    this.serviceName = serviceName;
  }

  /**
   * Définit le contexte par défaut (ex: au démarrage de la requête)
   */
  setDefaultContext(context: LogContext): void {
    this.defaultContext = { ...this.defaultContext, ...context };
  }

  /**
   * Nettoie le contexte par défaut
   */
  clearDefaultContext(): void {
    this.defaultContext = {};
  }

  /**
   * Log formaté
   */
  private log(level: LogLevel, message: string, context: LogContext = {}, error?: Error): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        ...this.defaultContext,
        ...context,
        service: this.serviceName,
        environment: process.env.NODE_ENV ?? 'development',
        version: process.env.npm_package_version ?? 'unknown',
      },
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    // Output JSON sur stdout (capturé par Loki/Datadog/etc.)
    const output = JSON.stringify(entry);
    
    // En développement, aussi format lisible
    if (process.env.NODE_ENV === 'development') {
      const prefix = `[${level.toUpperCase()}]`;
      const ctxStr = Object.keys(context).length ? ` ${JSON.stringify(context)}` : '';
      console.log(`${prefix} ${new Date().toISOString()} ${message}${ctxStr}`);
    } else {
      // Production: JSON pur sur stdout
      process.stdout.write(output + '\n');
    }
  }

  debug(message: string, context: LogContext = {}, error?: Error): void {
    this.log('debug', message, context, error);
  }

  info(message: string, context: LogContext = {}, error?: Error): void {
    this.log('info', message, context, error);
  }

  warn(message: string, context: LogContext = {}, error?: Error): void {
    this.log('warn', message, context, error);
  }

  error(message: string, context: LogContext = {}, error?: Error): void {
    this.log('error', message, context, error);
  }

  /**
   * Log d'accès HTTP
   */
  httpAccess(params: {
    method: string;
    url: string;
    statusCode: number;
    durationMs: number;
    userAgent?: string;
    ip?: string;
    userId?: string;
    correlationId?: string;
  }): void {
    this.info('HTTP Request', {
      correlationId: params.correlationId,
      http: {
        method: params.method,
        url: params.url,
        statusCode: params.statusCode,
        durationMs: params.durationMs,
      },
      userAgent: params.userAgent,
      ip: params.ip,
      userId: params.userId,
    });
  }

  /**
   * Log de requête DB
   */
  dbQuery(params: {
    operation: string;
    model: string;
    durationMs: number;
    correlationId?: string;
    success: boolean;
    error?: Error;
  }): void {
    const level = params.success ? 'debug' : 'warn';
    this.log(level, 'Database Query', {
      correlationId: params.correlationId,
      db: {
        operation: params.operation,
        model: params.model,
        durationMs: params.durationMs,
      },
      success: params.success,
    }, params.error);
  }

  /**
   * Log d'appel API externe
   */
  externalApi(params: {
    api: string;
    operation: string;
    durationMs: number;
    statusCode?: number;
    correlationId?: string;
    success: boolean;
    error?: Error;
  }): void {
    const level = params.success ? 'debug' : 'warn';
    this.log(level, 'External API Call', {
      correlationId: params.correlationId,
      externalApi: {
        api: params.api,
        operation: params.operation,
        durationMs: params.durationMs,
        statusCode: params.statusCode,
      },
      success: params.success,
    }, params.error);
  }

  /**
   * Log métier (événement business)
   */
  businessEvent(params: {
    event: string;
    entityType: string;
    entityId: string;
    userId?: string;
    correlationId?: string;
    metadata?: Record<string, unknown>;
  }): void {
    this.info(`Business Event: ${params.event}`, {
      correlationId: params.correlationId,
      business: {
        event: params.event,
        entityType: params.entityType,
        entityId: params.entityId,
      },
      userId: params.userId,
      metadata: params.metadata,
    });
  }

  /**
   * Log d'audit (sécurité/conformité)
   */
  audit(params: {
    action: string;
    resource: string;
    resourceId: string;
    userId: string;
    correlationId?: string;
    ip?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
    success: boolean;
    error?: Error;
  }): void {
    this.info(`Audit: ${params.action} ${params.resource}`, {
      correlationId: params.correlationId,
      audit: {
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        userId: params.userId,
        ip: params.ip,
        userAgent: params.userAgent,
        success: params.success,
      },
      metadata: params.metadata,
    }, params.error);
  }
}

// Instance singleton
export const logger = new StructuredLogger();

// Helper pour middleware Next.js
export function createRequestLogger(request: Request, correlationId?: string) {
  const cid = correlationId ?? extractCorrelationId(request.headers);
  logger.setDefaultContext({ correlationId: cid });
  return logger;
}

/**
 * Middleware wrapper pour logging automatique des requêtes
 */
export function withLogging<T extends (...args: unknown[]) => Promise<unknown>>(
  handler: T,
  operationName: string
): T {
  return (async (...args: unknown[]) => {
    const correlationId = generateCorrelationId();
    logger.setDefaultContext({ correlationId });
    
    const startTime = Date.now();
    logger.info(`Starting ${operationName}`, { operation: operationName });
    
    try {
      const result = await handler(...args);
      const duration = Date.now() - startTime;
      logger.info(`Completed ${operationName}`, { 
        operation: operationName, 
        durationMs: duration,
        success: true 
      });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Failed ${operationName}`, { 
        operation: operationName, 
        durationMs: duration,
        success: false 
      }, error as Error);
      throw error;
    } finally {
      logger.clearDefaultContext();
    }
  }) as T;
}
/**
 * Circuit Breaker pour APIs externes
 * Évite les cascades de pannes quand un service est down
 */

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal, requêtes passent
  OPEN = 'OPEN',         // Coupé, requêtes échouent immédiatement
  HALF_OPEN = 'HALF_OPEN' // Test de récupération
}

export interface CircuitBreakerConfig {
  failureThreshold?: number;    // Nombre d'échecs avant ouverture (défaut: 5)
  successThreshold?: number;    // Succès requis pour fermer (défaut: 2)
  timeout?: number;             // Temps avant tentative half-open (ms, défaut: 30000)
  excludedErrors?: string[];   // Erreurs à ne pas compter comme échecs
}

interface CircuitMetrics {
  failures: number;
  successes: number;
  lastFailureTime: number;
  state: CircuitState;
  nextAttempt: number;
}

export class CircuitBreaker {
  private metrics: CircuitMetrics;
  private config: Required<CircuitBreakerConfig>;
  private listeners: Set<(state: CircuitState) => void> = new Set();

  constructor(config: CircuitBreakerConfig = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      successThreshold: config.successThreshold ?? 2,
      timeout: config.timeout ?? 30000,
      excludedErrors: config.excludedErrors ?? [],
    };

    this.metrics = {
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      state: CircuitState.CLOSED,
      nextAttempt: 0,
    };
  }

  /**
   * Exécute une fonction avec protection circuit breaker
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new Error(`Circuit breaker OPEN - Service unavailable. Retry after ${Math.ceil((this.metrics.nextAttempt - Date.now()) / 1000)}s`);
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Vérifie si l'exécution est autorisée
   */
  private canExecute(): boolean {
    if (this.metrics.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.metrics.state === CircuitState.OPEN) {
      if (Date.now() >= this.metrics.nextAttempt) {
        this.transitionToHalfOpen();
        return true;
      }
      return false;
    }

    // HALF_OPEN : autoriser une seule requête de test
    return true;
  }

  /**
   * Gestion du succès
   */
  private onSuccess(): void {
    this.metrics.failures = 0;
    
    if (this.metrics.state === CircuitState.HALF_OPEN) {
      this.metrics.successes++;
      if (this.metrics.successes >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }
  }

  /**
   * Gestion de l'échec
   */
  private onFailure(error: Error): void {
    // Vérifier si l'erreur est exclue
    if (this.config.excludedErrors.some(e => error.message.includes(e))) {
      return;
    }

    this.metrics.failures++;
    this.metrics.lastFailureTime = Date.now();
    this.metrics.successes = 0;

    if (this.metrics.state === CircuitState.HALF_OPEN) {
      // Échec en half-open = retour à open
      this.transitionToOpen();
    } else if (this.metrics.state === CircuitState.CLOSED) {
      if (this.metrics.failures >= this.config.failureThreshold) {
        this.transitionToOpen();
      }
    }
  }

  /**
   * Transition vers OPEN
   */
  private transitionToOpen(): void {
    this.metrics.state = CircuitState.OPEN;
    this.metrics.nextAttempt = Date.now() + this.config.timeout;
    this.notifyListeners();
  }

  /**
   * Transition vers HALF_OPEN
   */
  private transitionToHalfOpen(): void {
    this.metrics.state = CircuitState.HALF_OPEN;
    this.metrics.successes = 0;
    this.notifyListeners();
  }

  /**
   * Transition vers CLOSED
   */
  private transitionToClosed(): void {
    this.metrics.state = CircuitState.CLOSED;
    this.metrics.failures = 0;
    this.metrics.successes = 0;
    this.notifyListeners();
  }

  /**
   * Notifie les listeners de changement d'état
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.metrics.state);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * S'abonne aux changements d'état
   */
  onStateChange(listener: (state: CircuitState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * État actuel
   */
  getState(): CircuitState {
    return this.metrics.state;
  }

  /**
   * Métriques actuelles
   */
  getMetrics(): Readonly<CircuitMetrics> {
    return { ...this.metrics };
  }

  /**
   * Reset manuel
   */
  reset(): void {
    this.metrics = {
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      state: CircuitState.CLOSED,
      nextAttempt: 0,
    };
    this.notifyListeners();
  }

  /**
   * Force l'ouverture (maintenance)
   */
  forceOpen(): void {
    this.transitionToOpen();
  }

  /**
   * Force la fermeture (recovery manuel)
   */
  forceClose(): void {
    this.transitionToClosed();
  }
}

// Registry global pour tous les circuit breakers
const circuitBreakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string, config?: CircuitBreakerConfig): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker(config));
  }
  return circuitBreakers.get(name)!;
}

export function removeCircuitBreaker(name: string): boolean {
  return circuitBreakers.delete(name);
}

export function getAllCircuitBreakers(): Map<string, CircuitBreaker> {
  return new Map(circuitBreakers);
}

/**
 * Circuit breakers préconfigurés pour les services externes
 */
export const ExternalCircuits = {
  ocr: () => getCircuitBreaker('ocr', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 60000,
    excludedErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'timeout'],
  }),

  groq: () => getCircuitBreaker('groq', {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 30000,
    excludedErrors: ['rate_limit', 'quota'],
  }),

  openMeteo: () => getCircuitBreaker('open-meteo', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
  }),

  ban: () => getCircuitBreaker('ban', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
  }),

  travaux: () => getCircuitBreaker('travaux', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
  }),

  dataGouv: () => getCircuitBreaker('data-gouv', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 60000,
  }),

  resend: () => getCircuitBreaker('resend', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
  }),

  storage: () => getCircuitBreaker('storage', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
  }),
} as const;
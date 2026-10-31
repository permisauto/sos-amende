import { describe, it, expect, beforeEach, vi } from 'vitest';
import { queryCache, CacheKeys, CacheTags } from '@/lib/cache';
import { CircuitBreaker, CircuitState, ExternalCircuits } from '@/lib/circuit-breaker';
import { 
  DataLoader, 
  dossierLoader, 
  userLoader, 
  userDossiersLoader,
  clearAllLoaders 
} from '@/lib/dataloader';
import { resetAllMocks, mockPrisma, createTestDossier, createTestUser } from '@/test/setup';

describe('Cache', () => {
  beforeEach(() => {
    queryCache.cleanup();
  });

  it('should set and get values', () => {
    queryCache.set('test-key', { data: 'test' }, 1000);
    
    const result = queryCache.get('test-key');
    
    expect(result).toEqual({ data: 'test' });
  });

  it('should return null for expired entries', () => {
    queryCache.set('expired-key', { data: 'test' }, 1);
    
    // Wait for expiration
    return new Promise(resolve => setTimeout(resolve, 10)).then(() => {
      const result = queryCache.get('expired-key');
      expect(result).toBeNull();
    });
  });

  it('should invalidate by tag', () => {
    queryCache.set('key-1', { id: 1 }, 10000, ['user:1']);
    queryCache.set('key-2', { id: 2 }, 10000, ['user:1']);
    queryCache.set('key-3', { id: 3 }, 10000, ['user:2']);
    
    queryCache.invalidateTag('user:1');
    
    expect(queryCache.get('key-1')).toBeNull();
    expect(queryCache.get('key-2')).toBeNull();
    expect(queryCache.get('key-3')).toEqual({ id: 3 });
  });

  it('should invalidate multiple tags', () => {
    queryCache.set('key-1', { id: 1 }, 10000, ['tag:a', 'tag:b']);
    queryCache.set('key-2', { id: 2 }, 10000, ['tag:b']);
    queryCache.set('key-3', { id: 3 }, 10000, ['tag:c']);
    
    queryCache.invalidateTags(['tag:a', 'tag:b']);
    
    expect(queryCache.get('key-1')).toBeNull();
    expect(queryCache.get('key-2')).toBeNull();
    expect(queryCache.get('key-3')).toEqual({ id: 3 });
  });

  it('should return cache stats', () => {
    // Ensure clean state
    queryCache.cleanup();
    queryCache.set('stat-1', { id: 1 }, 10000, ['tag:a']);
    queryCache.set('stat-2', { id: 2 }, 10000, ['tag:b']);
    
    const stats = queryCache.getStats();
    
    expect(stats.size).toBe(2);
    expect(stats.tags).toBe(2);
  });
});

describe('CircuitBreaker', () => {
  let circuit: CircuitBreaker;
  
  beforeEach(() => {
    circuit = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 100, // 100ms for fast tests
    });
  });

  it('should start in CLOSED state', () => {
    expect(circuit.getState()).toBe(CircuitState.CLOSED);
  });

  it('should execute operation when CLOSED', async () => {
    const result = await circuit.execute(async () => 'success');
    
    expect(result).toBe('success');
    expect(circuit.getState()).toBe(CircuitState.CLOSED);
  });

  it('should open after failure threshold', async () => {
    // Fail 3 times
    for (let i = 0; i < 3; i++) {
      try {
        await circuit.execute(async () => { throw new Error('fail'); });
      } catch {}
    }
    
    expect(circuit.getState()).toBe(CircuitState.OPEN);
  });

  it('should reject immediately when OPEN', async () => {
    // Force open
    circuit.forceOpen();
    
    await expect(
      circuit.execute(async () => 'success')
    ).rejects.toThrow('Circuit breaker OPEN');
  });

  it('should transition to HALF_OPEN after timeout', async () => {
    circuit.forceOpen();
    
    // Wait for timeout (100ms)
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Next execution should be allowed (HALF_OPEN)
    const result = await circuit.execute(async () => 'success');
    
    expect(result).toBe('success');
    expect(circuit.getState()).toBe(CircuitState.HALF_OPEN);
  });

  it('should close after success threshold in HALF_OPEN', async () => {
    circuit.forceOpen();
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Success 1
    await circuit.execute(async () => 'success');
    expect(circuit.getState()).toBe(CircuitState.HALF_OPEN);
    
    // Success 2 (threshold = 2)
    await circuit.execute(async () => 'success');
    expect(circuit.getState()).toBe(CircuitState.CLOSED);
  });

  it('should reopen on failure in HALF_OPEN', async () => {
    circuit.forceOpen();
    await new Promise(resolve => setTimeout(resolve, 150));
    
    await circuit.execute(async () => 'success'); // First success
    
    try {
      await circuit.execute(async () => { throw new Error('fail'); }); // Failure
    } catch {}
    
    expect(circuit.getState()).toBe(CircuitState.OPEN);
  });

  it('should track metrics', () => {
    const metrics = circuit.getMetrics();
    
    expect(metrics.failures).toBe(0);
    expect(metrics.successes).toBe(0);
    expect(metrics.state).toBe(CircuitState.CLOSED);
  });

  it('should notify listeners on state change', () => {
    const listener = vi.fn();
    const unsubscribe = circuit.onStateChange(listener);
    
    circuit.forceOpen();
    
    expect(listener).toHaveBeenCalledWith(CircuitState.OPEN);
    
    unsubscribe();
    circuit.forceClose();
    expect(listener).toHaveBeenCalledTimes(1); // Not called again
  });

  it('should exclude certain errors from failure count', async () => {
    const circuitWithExclusions = new CircuitBreaker({
      failureThreshold: 2,
      excludedErrors: ['ECONNREFUSED'],
    });
    
    // Excluded error should not count
    try {
      await circuitWithExclusions.execute(async () => { 
        throw new Error('ECONNREFUSED: connection refused'); 
      });
    } catch {}
    
    try {
      await circuitWithExclusions.execute(async () => { 
        throw new Error('ECONNREFUSED: connection refused'); 
      });
    } catch {}
    
    expect(circuitWithExclusions.getState()).toBe(CircuitState.CLOSED);
  });
});

describe('ExternalCircuits', () => {
  it('should provide preconfigured circuits', () => {
    expect(ExternalCircuits.ocr()).toBeInstanceOf(CircuitBreaker);
    expect(ExternalCircuits.groq()).toBeInstanceOf(CircuitBreaker);
    expect(ExternalCircuits.openMeteo()).toBeInstanceOf(CircuitBreaker);
    expect(ExternalCircuits.ban()).toBeInstanceOf(CircuitBreaker);
    expect(ExternalCircuits.travaux()).toBeInstanceOf(CircuitBreaker);
    expect(ExternalCircuits.dataGouv()).toBeInstanceOf(CircuitBreaker);
    expect(ExternalCircuits.resend()).toBeInstanceOf(CircuitBreaker);
    expect(ExternalCircuits.storage()).toBeInstanceOf(CircuitBreaker);
  });

  it('should return same instance for same name', () => {
    const ocr1 = ExternalCircuits.ocr();
    const ocr2 = ExternalCircuits.ocr();
    
    expect(ocr1).toBe(ocr2);
  });
});

describe('DataLoader', () => {
  beforeEach(() => {
    clearAllLoaders();
    resetAllMocks();
  });

  it('should batch multiple loads', async () => {
    const loadFn = vi.fn().mockImplementation(async (keys: string[]) => {
      return keys.map(k => ({ id: k, value: `value-${k}` }));
    });
    
    const loader = new DataLoader<string, { id: string; value: string }>({
      batchKey: (k) => k,
      batchLoadFn: loadFn,
    });
    
    // Load multiple keys - should batch into single call
    const [result1, result2, result3] = await Promise.all([
      loader.load('1'),
      loader.load('2'),
      loader.load('3'),
    ]);
    
    expect(loadFn).toHaveBeenCalledTimes(1);
    expect(loadFn).toHaveBeenCalledWith(['1', '2', '3']);
    expect(result1.id).toBe('1');
    expect(result2.id).toBe('2');
    expect(result3.id).toBe('3');
  });

  it('should cache results', async () => {
    const loadFn = vi.fn().mockImplementation(async (keys: string[]) => {
      return keys.map(k => ({ id: k, value: `value-${k}` }));
    });
    
    const loader = new DataLoader<string, { id: string; value: string }>({
      batchKey: (k) => k,
      batchLoadFn: loadFn,
    });
    
    await loader.load('1');
    await loader.load('1'); // Second load
    
    expect(loadFn).toHaveBeenCalledTimes(1);
  });

  it('should clear cache', async () => {
    const loadFn = vi.fn().mockImplementation(async (keys: string[]) => {
      return keys.map(k => ({ id: k, value: `value-${k}` }));
    });
    
    const loader = new DataLoader<string, { id: string; value: string }>({
      batchKey: (k) => k,
      batchLoadFn: loadFn,
    });
    
    await loader.load('1');
    loader.clear('1');
    await loader.load('1');
    
    expect(loadFn).toHaveBeenCalledTimes(2);
  });

  it('should prime cache', async () => {
    const loader = new DataLoader<string, { id: string; value: string }>({
      batchKey: (k) => k,
      batchLoadFn: async (keys) => keys.map(k => ({ id: k, value: `value-${k}` })),
    });
    
    loader.prime('1', { id: '1', value: 'primed' });
    const result = await loader.load('1');
    
    expect(result.value).toBe('primed');
  });
});

describe('Domain DataLoaders', () => {
  beforeEach(() => {
    clearAllLoaders();
    resetAllMocks();
  });

  it('should batch dossier loads', async () => {
    const dossiers = [
      createTestDossier('user-1', { id: 'dossier-1' }),
      createTestDossier('user-1', { id: 'dossier-2' }),
    ];
    
    mockPrisma.dossier.findMany.mockResolvedValue(dossiers);
    
    const [d1, d2] = await Promise.all([
      dossierLoader.load('dossier-1'),
      dossierLoader.load('dossier-2'),
    ]);
    
    expect(mockPrisma.dossier.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.dossier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['dossier-1', 'dossier-2'] } },
      })
    );
    expect(d1?.id).toBe('dossier-1');
    expect(d2?.id).toBe('dossier-2');
  });

  it('should batch user loads', async () => {
    const users = [
      createTestUser({ id: 'user-1' }),
      createTestUser({ id: 'user-2' }),
    ];
    
    mockPrisma.user.findMany.mockResolvedValue(users);
    
    const [u1, u2] = await Promise.all([
      userLoader.load('user-1'),
      userLoader.load('user-2'),
    ]);
    
    expect(mockPrisma.user.findMany).toHaveBeenCalledTimes(1);
  });

  it('should batch user -> dossiers relation', async () => {
    const dossiers = [
      createTestDossier('user-1', { id: 'dossier-1' }),
      createTestDossier('user-1', { id: 'dossier-2' }),
    ];
    
    mockPrisma.dossier.findMany.mockResolvedValue(dossiers);
    
    const userDossiers = await userDossiersLoader.load('user-1');
    
    expect(userDossiers).toHaveLength(2);
    expect(mockPrisma.dossier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: { in: ['user-1'] } },
      })
    );
  });
});

describe('OptimizedDossierService Integration', () => {
  beforeEach(() => {
    clearAllLoaders();
    resetAllMocks();
    queryCache.cleanup();
    // Ensure DataLoader uses mocked prisma
    vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }), { virtual: true });
  });

  it('should use cache for dossier retrieval', async () => {
    const { OptimizedDossierService } = await import('@/lib/services/optimized');
    
    const testUser = createTestUser({ id: 'user-1' });
    const dossier = createTestDossier(testUser.id, { id: 'dossier-1' });
    
    mockPrisma.dossier.findUnique.mockResolvedValue(dossier);
    mockPrisma.auditLog.create.mockResolvedValue({});
    
    // Premier appel - va en base
    await OptimizedDossierService.getDossier('dossier-1', testUser.id, 'CLIENT');
    expect(mockPrisma.dossier.findUnique).toHaveBeenCalledTimes(1);
    
    // Deuxième appel - devrait venir du cache
    await OptimizedDossierService.getDossier('dossier-1', testUser.id, 'CLIENT');
    expect(mockPrisma.dossier.findUnique).toHaveBeenCalledTimes(1); // Pas d'appel supplémentaire
  });

  it('should invalidate cache on update', async () => {
    const { OptimizedDossierService } = await import('@/lib/services/optimized');
    
    const testUser = createTestUser({ id: 'user-1' });
    const dossier = createTestDossier(testUser.id, { id: 'dossier-1', statut: 'EN_ANALYSE' });
    const updatedDossier = { ...dossier, statut: 'PRET' };
    
    mockPrisma.dossier.findUnique.mockResolvedValue(dossier);
    mockPrisma.dossier.update.mockResolvedValue(updatedDossier);
    mockPrisma.auditLog.create.mockResolvedValue({});
    
    // Premier appel - met en cache
    await OptimizedDossierService.getDossier('dossier-1', testUser.id, 'CLIENT');
    
    // Mise à jour
    await OptimizedDossierService.updateDossier('dossier-1', { statut: 'PRET' }, testUser.id, 'CLIENT');
    
    // Le cache devrait être invalidé - prochain appel va en base
    mockPrisma.dossier.findUnique.mockResolvedValue(updatedDossier);
    await OptimizedDossierService.getDossier('dossier-1', testUser.id, 'CLIENT');
    
    expect(mockPrisma.dossier.findUnique).toHaveBeenCalledTimes(2);
  });
});
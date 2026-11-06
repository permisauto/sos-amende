import { vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@/prisma/generated-client';

// Mock server-only for auth tests
vi.mock('server-only', () => ({}));

// ============================================
// MOCK PRISMA CLIENT
// ============================================

const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  dossier: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  payment: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    aggregate: vi.fn(),
  },
  failleJuridique: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  sourceJuridique: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  preuuve: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  message: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  messageInterne: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  dossierEvent: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  dossierFaille: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  radarCalibration: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  lawyerMatch: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  autoAlimentationTrace: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  geminiUsage: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  rateLimitBucket: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    deleteMany: vi.fn(),
  },
  courrier: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  lienDepot: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  auditLog: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  verificationToken: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  $transaction: vi.fn((fn) => fn(mockPrisma)),
  $disconnect: vi.fn(),
};

// Export for tests to use
export { mockPrisma };

// Mock the prisma module
vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

// ============================================
// MOCK EXTERNAL SERVICES
// ============================================

// Mock Resend
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: 'mock-email-id' }, error: null }),
    },
  })),
}));

// Mock next-auth
vi.mock('next-auth', () => ({
  default: vi.fn().mockImplementation(() => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// ============================================
// TEST UTILITIES
// ============================================

/**
 * Crée un utilisateur de test
 */
export function createTestUser(overrides = {}) {
  return {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    email: 'test@example.com',
    name: 'Test User',
    role: 'CLIENT' as const,
    credits: 5,
    passwordHash: 'hashed-password',
    signatureUrl: null,
    telephone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Crée un juriste de test
 */
export function createTestJuriste(overrides = {}) {
  return createTestUser({
    id: `juriste-${Date.now()}`,
    email: 'juriste@test.local',
    name: 'Test Juriste',
    role: 'JURISTE',
    credits: 100,
    ...overrides,
  });
}

/**
 * Crée un admin de test
 */
export function createTestAdmin(overrides = {}) {
  return createTestUser({
    id: `admin-${Date.now()}`,
    email: 'admin@test.local',
    name: 'Test Admin',
    role: 'ADMIN',
    credits: 100,
    ...overrides,
  });
}

/**
 * Crée un dossier de test
 */
export function createTestDossier(userId: string, overrides = {}) {
  return {
    id: `dossier-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    userId,
    type: 'AMENDE' as const,
    statut: 'EN_ANALYSE' as const,
    pvUrl: '/uploads/pv-test.png',
    pvTexte: 'Texte OCR simulé',
    extractedData: { plaque: 'AB-123-CD', montant: '135' },
    prix: 39,
    voieProcedure: 'AMENDE_FORFAITAIRE',
    classeContravention: 4,
    dateLimite: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Crée un paiement de test
 */
export function createTestPayment(userId: string, dossierId?: string, overrides = {}) {
  return {
    id: `payment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    userId,
    dossierId: dossierId ?? null,
    amount: 39,
    currency: 'EUR',
    status: 'PENDING_VIREMENT' as const,
    kind: 'AMENDE' as const,
    optionLrar: false,
    preuveUrl: null,
    preuveNom: null,
    preuveUploadedAt: null,
    valideLe: null,
    refuseLe: null,
    refusMotif: null,
    rembourseLe: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Crée une faille de test
 */
export function createTestFaille(overrides = {}) {
  return {
    id: `faille-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    typeInfraction: 'AMENDE' as const,
    titreFaille: 'Test Faille',
    articleLoi: 'Art. Test',
    regle: 'Règle de test',
    templateLettre: 'Template de test {nom}',
    templateRefere: null,
    templateGracieux: null,
    questionsDynamiques: null,
    source: 'test',
    reglesDetection: [{ type: 'champAbsent', champ: 'plaque' }],
    jurisprudence: [],
    statut: 'ACTIVE' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Reset tous les mocks
 */
export function resetAllMocks() {
  vi.clearAllMocks();
  for (const key of Object.keys(mockPrisma)) {
    const model = mockPrisma[key as keyof typeof mockPrisma];
    if (model && typeof model === 'object') {
      for (const methodKey of Object.keys(model)) {
        if (typeof model[methodKey as keyof typeof model] === 'function') {
          vi.mocked(model[methodKey as keyof typeof model]).mockReset();
        }
      }
    }
  }
}

/**
 * Setup par défaut pour les tests de repository
 */
export function setupRepositoryMocks() {
  resetAllMocks();
  
  // Mock par défaut pour findUnique
  mockPrisma.user.findUnique.mockResolvedValue(null);
  mockPrisma.dossier.findUnique.mockResolvedValue(null);
  mockPrisma.payment.findUnique.mockResolvedValue(null);
  mockPrisma.failleJuridique.findUnique.mockResolvedValue(null);
  
  // Mock par défaut pour create
  mockPrisma.user.create.mockImplementation(async (data: { data: Record<string, unknown> }) => ({
    ...data.data,
    id: `user-${Date.now()}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  
  mockPrisma.dossier.create.mockImplementation(async (data: { data: Record<string, unknown> }) => ({
    ...data.data,
    id: `dossier-${Date.now()}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  
  mockPrisma.payment.create.mockImplementation(async (data: { data: Record<string, unknown> }) => ({
    ...data.data,
    id: `payment-${Date.now()}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  
  mockPrisma.failleJuridique.create.mockImplementation(async (data: { data: Record<string, unknown> }) => ({
    ...data.data,
    id: `faille-${Date.now()}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

/**
 * Assertions utilitaires
 */
export function expectToHaveBeenCalledWithMatch<T>(
  mockFn: ReturnType<typeof vi.fn>,
  expected: Partial<T>
) {
  expect(mockFn).toHaveBeenCalledWith(
    expect.objectContaining(expected as Record<string, unknown>)
  );
}

/**
 * Attend que les promises micro-tasks se résolvent
 */
export async function flushPromises() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setTimeout(resolve, 0));
}

// ============================================
// LIFECYCLE HOOKS
// ============================================

beforeAll(() => {
  // Setup global avant tous les tests
  console.log('[TEST] Global setup');
});

afterAll(() => {
  // Cleanup global
  console.log('[TEST] Global teardown');
});

beforeEach(() => {
  // Reset avant chaque test
  resetAllMocks();
  setupRepositoryMocks();
});

afterEach(() => {
  // Cleanup après chaque test
  vi.restoreAllMocks();
});
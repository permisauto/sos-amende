import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dossierRepository } from '@/lib/repositories/dossier';
import { userRepository } from '@/lib/repositories/user';
import { paymentRepository } from '@/lib/repositories/payment';
import { failleJuridiqueRepository } from '@/lib/repositories/faille-juridique';
import type { Prisma } from '@/prisma/generated-client';
import { mockPrisma, createTestUser, createTestDossier, createTestFaille, resetAllMocks } from '@/test/setup';

describe('Repositories', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('DossierRepository', () => {
    it('should find dossier by id with tenant isolation', async () => {
      const testUser = createTestUser({ id: 'user-1' });
      const testDossier = createTestDossier(testUser.id, { id: 'dossier-1' });
      
      mockPrisma.dossier.findUnique.mockResolvedValue(testDossier);
      
      const result = await dossierRepository.findUnique('dossier-1', testUser.id, 'CLIENT');
      
      expect(result).toEqual(testDossier);
      expect(mockPrisma.dossier.findUnique).toHaveBeenCalledWith({
        where: { id: 'dossier-1' },
        include: expect.any(Object),
      });
    });

    it('should return null when user tries to access another user dossier', async () => {
      const testUser1 = createTestUser({ id: 'user-1' });
      const testUser2 = createTestUser({ id: 'user-2' });
      const testDossier = createTestDossier(testUser2.id, { id: 'dossier-1' });
      
      mockPrisma.dossier.findUnique.mockResolvedValue(testDossier);
      
      const result = await dossierRepository.findUnique('dossier-1', testUser1.id, 'CLIENT');
      
      expect(result).toBeNull();
    });

    it('should allow admin to access any dossier', async () => {
      const testAdmin = createTestUser({ id: 'admin-1', role: 'ADMIN' });
      const testDossier = createTestDossier('user-other', { id: 'dossier-1' });
      
      mockPrisma.dossier.findUnique.mockResolvedValue(testDossier);
      
      const result = await dossierRepository.findUnique('dossier-1', testAdmin.id, 'ADMIN');
      
      expect(result).toEqual(testDossier);
    });

    it('should find dossiers by user with pagination', async () => {
      const testUser = createTestUser({ id: 'user-1' });
      const dossiers = [
        createTestDossier(testUser.id, { id: 'dossier-1' }),
        createTestDossier(testUser.id, { id: 'dossier-2' }),
      ];
      
      mockPrisma.dossier.findMany.mockResolvedValue(dossiers);
      mockPrisma.dossier.count.mockResolvedValue(2);
      
      const result = await dossierRepository.findMany({ userId: testUser.id }, { take: 10, skip: 0 }, testUser.id, 'CLIENT');
      
      expect(result).toHaveLength(2);
      expect(mockPrisma.dossier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: testUser.id }),
          take: 10,
          skip: 0,
        })
      );
    });

    it('should create dossier with user relation', async () => {
      const testUser = createTestUser({ id: 'user-1' });
      const newDossier = createTestDossier(testUser.id, { id: 'dossier-new' });
      
      mockPrisma.dossier.create.mockResolvedValue(newDossier);
      
      const result = await dossierRepository.create({
        user: { connect: { id: testUser.id } },
        type: 'AMENDE',
        statut: 'EN_ANALYSE',
        pvUrl: '/uploads/test.png',
        extractedData: {},
        prix: 39,
      });
      
      expect(result.id).toBe('dossier-new');
      expect(mockPrisma.dossier.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user: { connect: { id: testUser.id } },
          }),
        })
      );
    });

    it('should update dossier with tenant isolation', async () => {
      const testUser = createTestUser({ id: 'user-1' });
      const existingDossier = createTestDossier(testUser.id, { id: 'dossier-1' });
      const updatedDossier = { ...existingDossier, statut: 'PRET' };
      
      mockPrisma.dossier.findUnique.mockResolvedValue(existingDossier);
      mockPrisma.dossier.update.mockResolvedValue({ ...existingDossier, statut: 'PRET' });
      
      const result = await dossierRepository.update('dossier-1', { statut: 'PRET' }, testUser.id, 'CLIENT');
      
      expect(result.statut).toBe('PRET');
    });

    it('should throw when user tries to update another user dossier', async () => {
      const testUser1 = createTestUser({ id: 'user-1' });
      const testUser2 = createTestUser({ id: 'user-2' });
      
      mockPrisma.dossier.findUnique.mockResolvedValue(createTestDossier(testUser2.id));
      
      await expect(
        dossierRepository.update('dossier-1', { statut: 'PRET' }, testUser1.id, 'CLIENT')
      ).rejects.toThrow('Accès refusé');
    });
  });

  describe('UserRepository', () => {
    it('should find user by email', async () => {
      const testUser = createTestUser({ email: 'test@example.com' });
      
      mockPrisma.user.findUnique.mockResolvedValue(testUser);
      
      const result = await userRepository.findByEmail('test@example.com');
      
      expect(result).toEqual(testUser);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        select: expect.any(Object),
      });
    });

    it('should increment credits', async () => {
      const testUser = createTestUser({ id: 'user-1', credits: 5 });
      const updatedUser = { ...testUser, credits: 6 };
      
      mockPrisma.user.update.mockResolvedValue(updatedUser);
      
      const result = await userRepository.incrementCredits('user-1', 1);
      
      expect(result.credits).toBe(6);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { credits: { increment: 1 }, updatedAt: expect.any(Date) },
        select: expect.any(Object),
      });
    });

    it('should decrement credits with validation', async () => {
      const testUser = createTestUser({ id: 'user-1', credits: 5 });
      
      mockPrisma.user.findUnique.mockResolvedValue({ credits: 5 });
      mockPrisma.user.update.mockResolvedValue({ ...testUser, credits: 4 });
      
      const result = await userRepository.decrementCredits('user-1', 1);
      
      expect(result?.credits).toBe(4);
    });

    it('should return null when decrementing more credits than available', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ credits: 1 });
      
      const result = await userRepository.decrementCredits('user-1', 5);
      
      expect(result).toBeNull();
    });
  });

  describe('PaymentRepository', () => {
    it('should create pending payment', async () => {
      const payment = {
        id: 'payment-1',
        userId: 'user-1',
        amount: 39,
        currency: 'EUR',
        status: 'PENDING_VIREMENT',
        kind: 'AMENDE',
        optionLrar: false,
        dossierId: null,
      };
      
      mockPrisma.payment.create.mockResolvedValue(payment);
      
      const result = await paymentRepository.create({
        user: { connect: { id: 'user-1' } },
        amount: 39,
        currency: 'EUR',
        status: 'PENDING_VIREMENT',
        kind: 'AMENDE',
      });
      
      expect(result.id).toBe('payment-1');
    });

    it('should validate virement with transaction', async () => {
      const payment = {
        id: 'payment-1',
        userId: 'user-1',
        amount: 39,
        kind: 'AMENDE',
      };
      
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
          payment: {
            update: vi.fn().mockResolvedValue({ ...payment, status: 'PAID' }),
          },
          user: {
            update: vi.fn().mockResolvedValue({ credits: 1 }),
          },
          dossier: {
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return fn(tx);
      });
      
      const result = await paymentRepository.validateVirement('payment-1', 'admin-1');
      
      expect(result.status).toBe('PAID');
    });
  });

  describe('FailleJuridiqueRepository', () => {
    it('should find active failles by type', async () => {
      const failles = [
        createTestFaille({ id: 'faille-1', typeInfraction: 'AMENDE' }),
        createTestFaille({ id: 'faille-2', typeInfraction: 'AMENDE' }),
      ];
      
      mockPrisma.failleJuridique.findMany.mockResolvedValue(failles);
      
      const result = await failleJuridiqueRepository.findActiveByType('AMENDE');
      
      expect(result).toHaveLength(2);
      expect(mockPrisma.failleJuridique.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            typeInfraction: 'AMENDE',
            statut: 'ACTIVE',
          }),
        })
      );
    });

    it('should sync catalogue with non-destructive updates', async () => {
      const existingFaille = createTestFaille({ id: 'faille-1', regle: 'Existing rule' });
      const newFailleData = createTestFaille({ id: 'faille-1', regle: 'New rule' });
      
      mockPrisma.failleJuridique.findUnique.mockResolvedValue(existingFaille);
      mockPrisma.failleJuridique.update.mockResolvedValue({ ...existingFaille, regle: 'Existing rule' });
      
      const result = await failleJuridiqueRepository.syncCatalogue([
        newFailleData as unknown as Prisma.FailleJuridiqueCreateInput,
      ]);
      
      expect(result.updated).toBe(1);
      expect(result.created).toBe(0);
    });
  });
});
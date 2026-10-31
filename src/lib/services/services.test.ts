import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DossierService } from '@/lib/services/dossier';
import { UserService } from '@/lib/services/user';
import { PaymentService } from '@/lib/services/payment';
import { AuditLogger } from '@/lib/services/audit';
import { mockPrisma, createTestUser, createTestDossier, createTestPayment, resetAllMocks } from '@/test/setup';

describe('Services', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('DossierService', () => {
    beforeEach(() => {
      resetAllMocks();
      // Mock findUnique for ownership checks in transactions
      mockPrisma.dossier.findUnique.mockResolvedValue(null);
    });

    it('should create dossier after OCR analysis', async () => {
      const testUser = createTestUser({ id: 'user-1' });
      const newDossier = createTestDossier(testUser.id, { id: 'dossier-1' });
      
      mockPrisma.dossier.create.mockResolvedValue(newDossier);
      mockPrisma.auditLog.create.mockResolvedValue({});
      
      const result = await DossierService.createDossier({
        userId: testUser.id,
        type: 'AMENDE',
        pvUrl: '/uploads/test.png',
        extractedData: { plaque: 'AB-123-CD' },
        prix: 39,
      });
      
      expect(result.id).toBe('dossier-1');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: testUser.id,
            action: 'CREATE',
            resource: 'Dossier',
            resourceId: 'dossier-1',
          }),
        })
      );
    });

    it('should validate dossier by juriste', async () => {
      const juriste = createTestUser({ id: 'juriste-1', role: 'JURISTE' });
      const dossier = createTestDossier('user-1', { id: 'dossier-1', statut: 'A_VERIFIER' });
      const updatedDossier = { ...dossier, statut: 'PRET' };
      
      mockPrisma.dossier.findUnique.mockResolvedValue(dossier);
      mockPrisma.dossier.update.mockResolvedValue(updatedDossier);
      mockPrisma.dossierEvent.create.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
      
      const result = await DossierService.validerParJuriste(
        'dossier-1',
        juriste.id,
        {
          lettreGeneree: 'Lettre de contestation...',
          canalEnvoi: 'ANTAI',
        }
      );
      
      expect(result.statut).toBe('PRET');
      expect(mockPrisma.dossier.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'dossier-1' },
          data: expect.objectContaining({
            lettreGeneree: 'Lettre de contestation...',
            canalEnvoi: 'ANTAI',
            valideLe: expect.any(Date),
          }),
        })
      );
    });

    it('should reject dossier by juriste', async () => {
      const juriste = createTestUser({ id: 'juriste-1', role: 'JURISTE' });
      const dossier = createTestDossier('user-1', { id: 'dossier-1', statut: 'A_VERIFIER' });
      const rejectedDossier = { ...dossier, statut: 'REJETE', motifRejet: 'Motif de rejet' };
      
      mockPrisma.dossier.findUnique.mockResolvedValue(dossier);
      mockPrisma.dossier.update.mockResolvedValue(rejectedDossier);
      mockPrisma.dossierEvent.create.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
      
      const result = await DossierService.rejeterParJuriste(
        'dossier-1',
        juriste.id,
        'Motif de rejet'
      );
      
      expect(result.statut).toBe('REJETE');
      expect(result.motifRejet).toBe('Motif de rejet');
    });

    it('should send dossier and set decision deadline', async () => {
      const juriste = createTestUser({ id: 'juriste-1', role: 'JURISTE' });
      const dossier = createTestDossier('user-1', { id: 'dossier-1', statut: 'PRET' });
      const sentDossier = { ...dossier, statut: 'ENVOYE', numeroDepot: 'DEP-123' };
      
      mockPrisma.dossier.findUnique.mockResolvedValue(dossier);
      mockPrisma.dossier.update.mockResolvedValue(sentDossier);
      mockPrisma.dossierEvent.create.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
      
      const result = await DossierService.envoyer(
        'dossier-1',
        juriste.id,
        {
          numeroDepot: 'DEP-123',
          canalEnvoi: 'ANTAI',
        }
      );
      
      expect(result.statut).toBe('ENVOYE');
      expect(result.numeroDepot).toBe('DEP-123');
      expect(result.decisionAttendueLe).toBeDefined();
    });
  });

  describe('UserService', () => {
    it('should create user on registration', async () => {
      const newUser = createTestUser({ 
        id: 'user-new', 
        email: 'new@test.com',
        credits: 0 
      });
      
      mockPrisma.user.create.mockResolvedValue(newUser);
      mockPrisma.auditLog.create.mockResolvedValue({});
      
      const result = await UserService.createUser({
        email: 'new@test.com',
        name: 'New User',
        passwordHash: 'hashed',
      });
      
      expect(result.email).toBe('new@test.com');
      expect(result.credits).toBe(0);
    });

    it('should add credits after virement validation', async () => {
      const user = createTestUser({ id: 'user-1', credits: 0 });
      const updatedUser = { ...user, credits: 1 };
      
      mockPrisma.user.update.mockResolvedValue(updatedUser);
      mockPrisma.auditLog.create.mockResolvedValue({});
      
      const result = await UserService.addCredits('user-1', 1, 'Virement validé');
      
      expect(result.credits).toBe(1);
    });

    it('should use credit for analysis', async () => {
      const user = createTestUser({ id: 'user-1', credits: 5 });
      const updatedUser = { ...user, credits: 4 };
      
      mockPrisma.user.findUnique.mockResolvedValue({ credits: 5 });
      mockPrisma.user.update.mockResolvedValue(updatedUser);
      mockPrisma.auditLog.create.mockResolvedValue({});
      
      const result = await UserService.useCredit('user-1', 1, 'Analyse dossier');
      
      expect(result?.credits).toBe(4);
    });

    it('should return null when insufficient credits', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ credits: 0 });
      
      const result = await UserService.useCredit('user-1', 1, 'Analyse dossier');
      
      expect(result).toBeNull();
    });
  });

  describe('PaymentService', () => {
    it('should create pending virement', async () => {
      const payment = createTestPayment('user-1', 'dossier-1');
      
      mockPrisma.payment.create.mockResolvedValue(payment);
      mockPrisma.auditLog.create.mockResolvedValue({});
      
      const result = await PaymentService.createPendingVirement({
        userId: 'user-1',
        amount: 39,
        kind: 'AMENDE',
        dossierId: 'dossier-1',
      });
      
      expect(result.id).toBe(payment.id);
      expect(result.status).toBe('PENDING_VIREMENT');
    });

    it('should validate virement and add credit', async () => {
      const payment = createTestPayment('user-1', 'dossier-1', { 
        id: 'payment-1',
        kind: 'AMENDE',
        amount: 39,
      });
      const validatedPayment = { ...payment, status: 'PAID' };
      
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
          payment: {
            update: vi.fn().mockResolvedValue(validatedPayment),
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
      
      mockPrisma.auditLog.create.mockResolvedValue({});
      
      const result = await PaymentService.validateVirement('payment-1', 'admin-1');
      
      expect(result.status).toBe('PAID');
    });

    it('should refuse virement with mandatory motif', async () => {
      const payment = createTestPayment('user-1', 'dossier-1');
      const refusedPayment = { ...payment, status: 'REFUSED', refusMotif: 'Preuve invalide' };
      
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
          payment: {
            update: vi.fn().mockResolvedValue(refusedPayment),
          },
          dossierEvent: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return fn(tx);
      });
      
      mockPrisma.auditLog.create.mockResolvedValue({});
      
      const result = await PaymentService.refuseVirement('payment-1', 'admin-1', 'Preuve invalide');
      
      expect(result.status).toBe('REFUSED');
      expect(result.refusMotif).toBe('Preuve invalide');
    });
  });

  describe('AuditLogger', () => {
    it('should log audit entries', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({});
      
      await AuditLogger.log({
        userId: 'user-1',
        action: 'CREATE',
        resource: 'Dossier',
        resourceId: 'dossier-1',
        metadata: { test: true },
      });
      
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            action: 'CREATE',
            resource: 'Dossier',
            resourceId: 'dossier-1',
          }),
        })
      );
    });

    it('should not throw on audit failure', async () => {
      mockPrisma.auditLog.create.mockRejectedValue(new Error('DB Error'));
      
      // Ne doit pas throw
      await expect(
        AuditLogger.log({
          userId: 'user-1',
          action: 'CREATE',
          resource: 'Dossier',
        })
      ).resolves.not.toThrow();
    });
  });
});
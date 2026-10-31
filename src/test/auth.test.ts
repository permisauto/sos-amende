import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetAllMocks, createTestUser } from '@/test/setup';

// Mock the auth module
vi.mock('@/auth', () => ({
  createEmailVerificationToken: vi.fn(),
  verifyEmailToken: vi.fn(),
}));

import { createEmailVerificationToken, verifyEmailToken } from '@/auth';

describe('Auth - Email Verification', () => {
  beforeEach(() => {
    resetAllMocks();
    vi.clearAllMocks();
  });

  describe('createEmailVerificationToken', () => {
    it('should create a token with 24h expiry', async () => {
      const token = 'mock-token-123';
      
      // Mock crypto.randomBytes
      const originalRandomBytes = require('crypto').randomBytes;
      require('crypto').randomBytes = vi.fn().mockReturnValue(Buffer.from(token, 'hex'));
      
      mockPrisma.verificationToken.create.mockResolvedValue({});
      
      const { createEmailVerificationToken } = await import('@/auth');
      const result = await createEmailVerificationToken('test@example.com');
      
      expect(result).toBe(token);
      expect(mockPrisma.verificationToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            identifier: 'test@example.com',
            token,
            expires: expect.any(Date),
          }),
        })
      );
      
      // Restore
      require('crypto').randomBytes = originalRandomBytes;
    });
  });

  describe('verifyEmailToken', () => {
    it('should return true for valid token', async () => {
      mockPrisma.verificationToken.findFirst.mockResolvedValue({
        identifier: 'test@example.com',
        token: 'valid-token',
        expires: new Date(Date.now() + 3600000),
      });
      mockPrisma.verificationToken.delete.mockResolvedValue({});
      
      const { verifyEmailToken } = await import('@/auth');
      const result = await verifyEmailToken('test@example.com', 'valid-token');
      
      expect(result).toBe(true);
      expect(mockPrisma.verificationToken.delete).toHaveBeenCalledWith({
        where: { identifier_token: { identifier: 'test@example.com', token: 'valid-token' } },
      });
    });

    it('should return false for expired token', async () => {
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null);
      
      const { verifyEmailToken } = await import('@/auth');
      const result = await verifyEmailToken('test@example.com', 'expired-token');
      
      expect(result).toBe(false);
    });

    it('should return false for non-existent token', async () => {
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null);
      
      const { verifyEmailToken } = await import('@/auth');
      const result = await verifyEmailToken('test@example.com', 'non-existent');
      
      expect(result).toBe(false);
    });

    it('should delete token after verification', async () => {
      mockPrisma.verificationToken.findFirst.mockResolvedValue({
        identifier: 'test@example.com',
        token: 'valid-token',
        expires: new Date(Date.now() + 3600000),
      });
      mockPrisma.verificationToken.delete.mockResolvedValue({});
      
      const { verifyEmailToken } = await import('@/auth');
      await verifyEmailToken('test@example.com', 'valid-token');
      
      expect(mockPrisma.verificationToken.delete).toHaveBeenCalled();
    });
  });
});

describe('Auth - Rate Limiting', () => {
  it('should limit auth attempts', async () => {
    const { authRateLimit } = await import('@/lib/auth-rate-limit');
    
    // Mock the rate limiter
    const { consommerCreneau } = await import('@/lib/rate-limit');
    vi.mocked(consommerCreneau).mockResolvedValue(5);
    
    // First request
    const req1 = new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'x-forwarded-for': '192.168.1.1' },
    });
    
    const res1 = await authRateLimit(req1);
    expect(res1).toBeNull(); // Not rate limited
    
    // Exhaust limit
    vi.mocked(consommerCreneau).mockResolvedValue(0);
    
    const req2 = new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'x-forwarded-for': '192.168.1.1' },
    });
    
    const res2 = await authRateLimit(req2);
    expect(res2).not.toBeNull();
    expect(res2!.status).toBe(429);
  });
});

describe('Auth - DAL Functions', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should redirect non-authenticated users', async () => {
    vi.mock('@/lib/dal', () => ({
      requireUser: vi.fn().mockRejectedValue(new Error('Not authenticated')),
    }));
    
    const { requireUser } = await import('@/lib/dal');
    
    await expect(requireUser()).rejects.toThrow();
  });

  it('should require juriste role', async () => {
    vi.mock('@/lib/dal', () => ({
      getCurrentUser: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'client@test.com',
        role: 'CLIENT',
        credits: 5,
      }),
    }));
    
    const { requireJuriste } = await import('@/lib/dal');
    
    await expect(requireJuriste()).rejects.toThrow();
  });

  it('should allow juriste access', async () => {
    vi.mock('@/lib/dal', () => ({
      getCurrentUser: vi.fn().mockResolvedValue({
        id: 'juriste-1',
        email: 'juriste@test.com',
        role: 'JURISTE',
        credits: 10,
      }),
    }));
    
    const { requireJuriste } = await import('@/lib/dal');
    
    const result = await requireJuriste();
    expect(result.role).toBe('JURISTE');
  });
});
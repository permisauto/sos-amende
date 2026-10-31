import { GET, POST } from '@/app/api/paiement/virement/preuve/route';
import { mockRequest } from 'node-mocks-http';
import { NextResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { storageWrite, storageDelete } from '@/lib/storage';
import { consommerCreneau } from '@/lib/rate-limit';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  payment: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
}));
jest.mock('@/lib/storage', () => ({
  storageWrite: jest.fn(),
  storageDelete: jest.fn(),
}));
jest.mock('@/lib/rate-limit', () => ({
  consommerCreneau: jest.fn(),
}));

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE = 8 * 1024 * 1024;

describe('POST /api/paiement/virement/preuve', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 if paymentId is missing', async () => {
    const req = mockRequest({
      method: 'POST',
      body: new URLSearchParams(),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Référence de paiement manquante.' });
  });

  it('returns 400 if no file is selected', async () => {
    const form = new FormData();
    form.append('paymentId', 'pay-123');
    const req = mockRequest({
      method: 'POST',
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Veuillez sélectionner une preuve.' });
  });

  it('returns 400 if file type is unsupported', async () => {
    const form = new FormData();
    form.append('paymentId', 'pay-123');
    const file = new File(['dummy'], 'test.txt', { type: 'text/plain' });
    form.append('fichier', file);
    const req = mockRequest({
      method: 'POST',
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Format non supporté (JPEG, PNG, WebP ou PDF).' });
  });

  it('returns 400 if file size exceeds limit', async () => {
    const form = new FormData();
    form.append('paymentId', 'pay-123');
    const largeFile = new File(['a'.repeat(9 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' });
    form.append('fichier', largeFile);
    const req = mockRequest({
      method: 'POST',
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Fichier trop volumineux (maximum 8 Mo).' });
  });

  it('returns 403 if payment does not belong to the user', async () => {
    const mockUser = { id: 'user-1', id: 'user-1' };
    const session = { user: mockUser };
    (await prisma.payment.findUnique).mockResolvedValue({
      id: 'pay-123',
      userId: 'other-user',
      status: 'PENDING_VIREMENT',
    });
    const req = mockRequest({
      headers: { 'x-forwarded-for': '1.2.3.4' },
      body: new FormData(),
    });
    // @ts-ignore
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Paiement non appartenant à votre compte.' });
  });

  it('successfully uploads a valid file', async () => {
    const mockPayment = { id: 'pay-123', userId: 'user-1', status: 'PENDING_VIREMENT' };
    (await prisma.payment.findUnique).mockResolvedValue(mockPayment);
    (await storageWrite).mockResolvedValue('/tmp/file.pdf');
    (await prisma.payment.update).mockResolvedValue({});

    const form = new FormData();
    form.append('paymentId', 'pay-123');
    const file = new File(['dummy'], 'test.pdf', { type: 'application/pdf' });
    form.append('fichier', file);
    const req = mockRequest({
      method: 'POST',
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, nom: 'test.pdf' });
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pay-123' }, data: expect.objectContaining({ preuveUrl: expect.any(String) }) })
    );
  });

  it('handles rate limit', async () => {
    (await consommerCreneau).mockReturnValue(0);
    const form = new FormData();
    form.append('paymentId', 'pay-123');
    const file = new File(['dummy'], 'test.pdf', { type: 'application/pdf' });
    form.append('fichier', file);
    const req = mockRequest({
      method: 'POST',
      headers: { 'x-forwarded-for': '1.2.3.4' },
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Trop d\'envois récents, réessayez dans quelques minutes.' });
  });
});
import { render, screen, fireEvent } from '@testing-library/react';
import { PreuveVirementUpload } from '@/components/preuve-virement-upload';
import { renderHook } from '@testing-library/react-hooks';
import { useState } from 'react';

describe('PreuveVirementUpload component', () => {
  it('renders initial UI', () => {
    render(<PreuveVirementUpload paymentId="pay-123" />);
    expect(screen.getByText(/Téléversez votre preuve de virement/i)).toBeInTheDocument();
    expect(screen.getByText(/Téléversez votre preuve de virement/i)).toBeInTheDocument();
    const input = screen.getByRole('button', { name: /Choisir un fichier/i });
    expect(input).toBeInTheDocument();
  });

  it('shows error when selecting an invalid file type', async () => {
    const mockFile = new File(['dummy'], 'invalid.txt', { type: 'text/plain' });
    const handleUpload = jest.fn();
    // @ts-ignore
    fireEvent.change(screen.getByRole('button', { name: /Choisir un fichier/i }), { target: { files: [mockFile] } });
    // @ts-ignore
    await screen.getByText(/Choisir un fichier/i).closest('label').querySelector('input').dispatchEvent(
      new Event('change', { target: { files: [mockFile] } })
    );
    expect(await screen.findByText(/Le fichier doit être JPEG, PNG, WebP ou PDF et ne pas dépasser 8 Mo./i)).toBeInTheDocument();
  });

  it('shows error when file exceeds size limit', async () => {
    const largeFile = new File([new Uint8Array(9 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' });
    const handleUpload = jest.fn();
    // @ts-ignore
    fireEvent.change(screen.getByRole('button', { name: /Choisir un fichier/i }), { target: { files: [largeFile] } });
    // @ts-ignore
    await screen.getByText(/Choisir un fichier/i).closest('label').querySelector('input').dispatchEvent(
      new Event('change', { target: { files: [largeFile] } })
    );
    expect(await screen.findByText(/Fichier trop volumineux.*maximum 8 Mo./i)).toBeInTheDocument();
  });

  it('calls fetch with correct FormData when valid file is selected', async () => {
    const mockFile = new File(['content'], 'valid.pdf', { type: 'application/pdf' });
    const handleUpload = jest.fn().mockResolvedValueOnce();
    // @ts-ignore
    fireEvent.change(screen.getByRole('button', { name: /Choisir un fichier/i }), { target: { files: [mockFile] } });
    // @ts-ignore
    await screen.getByText(/Choisir un fichier/i).closest('label').querySelector('input').dispatchEvent(
      new Event('change', { target: { files: [mockFile] } })
    );
    expect(handleUpload).toHaveBeenCalled();
    // Verify that fetch was called with correct FormData shape
    const fetchCall = fetch as jest.Mock;
    expect(fetchCall).toHaveBeenCalledWith(
      '/api/paiement/virement/preuve',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) })
    );
  });
});
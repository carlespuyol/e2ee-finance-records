// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
import RecordForm from '../components/RecordForm';
import { deriveKey } from '../services/crypto';
import * as apiModule from '../services/api';

// Mock AuthContext — RecordForm only needs auth.token, auth.cryptoKey, and logout
vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));
import { useAuth } from '../contexts/AuthContext';

let testCryptoKey: CryptoKey;
let mockLogout: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  testCryptoKey = await deriveKey('testpassword', 'test@example.com');
  mockLogout = vi.fn();
  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: {
      token: 'test-jwt-token',
      user: { id: 1, email: 'test@example.com' },
      cryptoKey: testCryptoKey,
    },
    logout: mockLogout,
    setAuth: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderForm(onAdded = vi.fn()) {
  return render(<RecordForm onAdded={onAdded} />);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RecordForm — encryption and submission', () => {
  it('1. submit sends Base64 encryptedData and iv, NOT plaintext field values', async () => {
    const createRecord = vi.spyOn(apiModule.api, 'createRecord').mockResolvedValue({ id: 1, createdAt: 'now' });

    renderForm();

    // Fill form fields by name attribute
    const inputs = document.querySelectorAll('input');
    fireEvent.change(inputs[0], { target: { name: 'productName', value: 'Widget' } });
    fireEvent.change(inputs[1], { target: { name: 'price', value: '99.99' } });
    fireEvent.change(inputs[2], { target: { name: 'seller', value: 'Acme' } });
    fireEvent.change(inputs[3], { target: { name: 'salesPerson', value: 'Bob' } });

    const form = document.querySelector('form')!;
    await act(async () => { fireEvent.submit(form); });

    await waitFor(() => expect(createRecord).toHaveBeenCalled());

    const [_token, encryptedData, iv] = createRecord.mock.calls[0];

    // encryptedData must be a non-empty Base64 string — never plaintext
    expect(typeof encryptedData).toBe('string');
    expect(encryptedData.length).toBeGreaterThan(0);
    expect(encryptedData).not.toContain('Widget');
    expect(encryptedData).not.toContain('99.99');
    expect(encryptedData).not.toContain('Acme');

    // encryptedData differs from the JSON serialisation of the form values
    const plainJSON = JSON.stringify({ productName: 'Widget', price: 99.99, seller: 'Acme', salesPerson: 'Bob' });
    expect(encryptedData).not.toBe(plainJSON);

    // IV decodes to exactly 12 bytes (standard AES-GCM nonce)
    expect(typeof iv).toBe('string');
    const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
    expect(ivBytes.length).toBe(12);
  });

  it('7. 401 response from API calls logout', async () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 });
    vi.spyOn(apiModule.api, 'createRecord').mockRejectedValue(err);

    renderForm();

    const form = document.querySelector('form')!;
    await act(async () => { fireEvent.submit(form); });

    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
  });

  it('8. non-401 API error displays an error message', async () => {
    const err = Object.assign(new Error('Server error'), { status: 500 });
    vi.spyOn(apiModule.api, 'createRecord').mockRejectedValue(err);

    renderForm();

    const form = document.querySelector('form')!;
    await act(async () => { fireEvent.submit(form); });

    await waitFor(() => {
      expect(document.body.textContent).toContain('Server error');
    });
  });
});

/**
 * Client-side integration tests — validates the complete E2EE pipeline.
 *
 * Unlike the unit tests (which test deriveKey, encrypt, decrypt individually),
 * these tests chain the functions together in the same sequence used by the
 * real application and verify the security invariants that result.
 *
 * No React components are rendered; no DOM or happy-dom environment needed.
 * Web Crypto is available natively in Node 20 under the default 'node' environment.
 */

import { describe, it, expect } from 'vitest';
import { deriveKey, encrypt, decrypt } from '../services/crypto';
import { FinanceRecord } from '../types';

// ---------------------------------------------------------------------------
// 1. E2EE round-trip via the exact API wire format
// ---------------------------------------------------------------------------

describe('Integration: E2EE round-trip via API wire format', () => {
  it('encrypts a record, simulates API round-trip, decrypts back to original', async () => {
    const key = await deriveKey('correct-password', 'user@test.com');

    const original: FinanceRecord = {
      productName: 'MacBook Pro',
      price: 2499.99,
      seller: 'Apple Store',
      salesPerson: 'Jane Smith',
      time: new Date('2024-01-15T10:30:00').toISOString(),
    };

    // RecordForm.tsx: JSON-serialise and encrypt before POST /api/records
    const { ciphertext, iv } = await encrypt(key, JSON.stringify(original));

    // api.createRecord sends { encryptedData: ciphertext, iv } to server.
    // api.getRecords returns the same blob unchanged.
    // DashboardPage.tsx: decrypt after GET /api/records
    const decryptedText = await decrypt(key, ciphertext, iv);
    const restored = JSON.parse(decryptedText) as FinanceRecord;

    expect(restored).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// 2. Re-derived key compatibility (simulates logout → login)
// ---------------------------------------------------------------------------

describe('Integration: re-derived key compatibility (session re-login)', () => {
  it('re-deriving the same key after logout decrypts records from the previous session', async () => {
    const password = 'my-strong-password';
    const email    = 'alice@example.com';

    // Session 1: user logs in, key is derived and stored in IndexedDB
    const keyA = await deriveKey(password, email);
    const record: FinanceRecord = {
      productName: 'Mechanical Keyboard',
      price: 149.99,
      seller: 'Keychron',
      salesPerson: 'Online',
      time: new Date('2024-03-01T09:00:00').toISOString(),
    };
    const { ciphertext, iv } = await encrypt(keyA, JSON.stringify(record));

    // Session 2: user logs back in (e.g. after clearing IndexedDB or on a new device).
    // The key is re-derived from the same password + email — no server dependency.
    const keyB = await deriveKey(password, email);

    const plaintext = await decrypt(keyB, ciphertext, iv);
    const restored = JSON.parse(plaintext) as FinanceRecord;

    expect(restored).toEqual(record);
  });
});

// ---------------------------------------------------------------------------
// 3. Cross-user isolation — wrong key must fail
// ---------------------------------------------------------------------------

describe('Integration: cross-user isolation (wrong key must fail)', () => {
  it("Bob's key cannot decrypt Alice's ciphertext (GCM authentication tag mismatch)", async () => {
    const aliceKey = await deriveKey('alice-secret-pass', 'alice@example.com');
    const bobKey   = await deriveKey('bob-secret-pass',   'bob@example.com');

    // Alice encrypts a confidential record
    const { ciphertext, iv } = await encrypt(
      aliceKey,
      JSON.stringify({ productName: 'Confidential Asset', price: 50_000 })
    );

    // Bob (or an attacker with server access) attempts to decrypt Alice's ciphertext.
    // AES-GCM authentication tag verification must fail → DOMException.
    await expect(decrypt(bobKey, ciphertext, iv)).rejects.toThrow();
  });
});

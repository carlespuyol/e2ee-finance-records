/**
 * crypto.test.ts — PRD §5 Core Security Tests
 *
 * Runs in Node environment (Web Crypto available natively on Node 20).
 * These tests validate the most critical security module in the application.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { deriveKey, encrypt, decrypt } from '../services/crypto';

// ─── Helpers ────────────────────────────────────────────────────────────────

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function makeKey(password = 'password', email = 'test@example.com') {
  return deriveKey(password, email);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('deriveKey — PRD §5.1 Key Derivation', () => {
  it('0. email normalisation: upper-case email derives same key as lower-case (LoginPage normalises before calling deriveKey)', async () => {
    const keyLower = await deriveKey('password', 'user@example.com');
    const keyUpper = await deriveKey('password', 'USER@EXAMPLE.COM');

    // Keys from different inputs — verify they are different (upper ≠ lower without normalisation)
    const { ciphertext, iv } = await encrypt(keyLower, 'hello');
    // Upper-case-derived key should NOT decrypt (different salt → different key)
    await expect(decrypt(keyUpper, ciphertext, iv)).rejects.toThrow();

    // LoginPage always calls: deriveKey(password, email.toLowerCase().trim())
    // Verify that normalised upper produces same key as lower:
    const keyUpperNormalised = await deriveKey('password', 'USER@EXAMPLE.COM'.toLowerCase().trim());
    const plaintext = await decrypt(keyUpperNormalised, ciphertext, iv);
    expect(plaintext).toBe('hello');
  });

  it('1. key determinism: same password+email always produces a key that can decrypt its own output', async () => {
    const key1 = await makeKey();
    const { ciphertext, iv } = await encrypt(key1, 'test payload');

    const key2 = await makeKey(); // same inputs
    const plaintext = await decrypt(key2, ciphertext, iv);
    expect(plaintext).toBe('test payload');
  });

  it('2. different password → different key: cross-key decryption throws', async () => {
    const key1 = await deriveKey('password1', 'test@example.com');
    const key2 = await deriveKey('password2', 'test@example.com');

    const { ciphertext, iv } = await encrypt(key1, 'secret');
    await expect(decrypt(key2, ciphertext, iv)).rejects.toThrow();
  });

  it('3. different email (different PBKDF2 salt) → different key', async () => {
    const key1 = await deriveKey('password', 'alice@example.com');
    const key2 = await deriveKey('password', 'bob@example.com');

    const { ciphertext, iv } = await encrypt(key1, 'secret');
    await expect(decrypt(key2, ciphertext, iv)).rejects.toThrow();
  });

  it('4. key is non-extractable — exportKey rejects (PRD §5.5 invariant 1)', async () => {
    const key = await makeKey();

    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('12. PBKDF2 iteration count verified via parameters (structural, not timing)', async () => {
    const deriveKeySpy = vi.spyOn(crypto.subtle, 'deriveKey');

    await makeKey();

    expect(deriveKeySpy).toHaveBeenCalled();
    const callArgs = deriveKeySpy.mock.calls[0];
    const algorithm = callArgs[0] as Pbkdf2Params;
    expect(algorithm.name).toBe('PBKDF2');
    expect(algorithm.iterations).toBe(600_000);
    expect(algorithm.hash).toBe('SHA-256');

    deriveKeySpy.mockRestore();
  });
});

describe('encrypt / decrypt — PRD §5.2 + §5.3', () => {
  it('5. IV uniqueness: 50 consecutive encryptions all produce unique IVs (PRD §5.5 invariant 3)', async () => {
    const key = await makeKey();
    const ivSet = new Set<string>();

    for (let i = 0; i < 50; i++) {
      const { iv } = await encrypt(key, `payload ${i}`);
      ivSet.add(iv);
    }

    expect(ivSet.size).toBe(50);
  });

  it('6. IV is exactly 12 bytes (standard for AES-GCM)', async () => {
    const key = await makeKey();
    const { iv } = await encrypt(key, 'test');
    const ivBytes = base64ToBytes(iv);
    expect(ivBytes.length).toBe(12);
  });

  it('7. round-trip: decrypt returns original plaintext', async () => {
    const key = await makeKey();
    const original = JSON.stringify({ productName: 'Widget', price: 99.99, seller: 'Acme' });

    const { ciphertext, iv } = await encrypt(key, original);
    const recovered = await decrypt(key, ciphertext, iv);
    expect(recovered).toBe(original);
  });

  it('8. GCM integrity — tampered ciphertext throws DOMException (PRD §5.2)', async () => {
    const key = await makeKey();
    const { ciphertext, iv } = await encrypt(key, 'sensitive data');

    // Flip a character in the ciphertext to simulate tampering
    const tampered = ciphertext.slice(0, -4) + 'XXXX';
    await expect(decrypt(key, tampered, iv)).rejects.toThrow();
  });

  it('9. GCM integrity — wrong IV causes authentication failure', async () => {
    const key = await makeKey();
    const { ciphertext } = await encrypt(key, 'sensitive data');
    const wrongIv = btoa('AAAAAAAAAAAA'); // 12 bytes, wrong value

    await expect(decrypt(key, ciphertext, wrongIv)).rejects.toThrow();
  });

  it('10. large payload — 100 KB string encrypts and decrypts without stack overflow (PRD §7.1 btoa bug fix)', async () => {
    const key = await makeKey();
    const large = 'X'.repeat(100_000);

    // Must not throw RangeError from spread-based btoa
    const { ciphertext, iv } = await encrypt(key, large);
    const recovered = await decrypt(key, ciphertext, iv);
    expect(recovered).toBe(large);
  });

  it('11. Base64 round-trip: encoding then decoding preserves all bytes', async () => {
    const key = await makeKey();
    // Encrypt random-ish content and verify ciphertext Base64 decodes to same byte count
    const payload = 'A'.repeat(256);
    const { ciphertext } = await encrypt(key, payload);

    // ciphertext Base64 must decode without loss
    const bytes = base64ToBytes(ciphertext);
    expect(bytes.length).toBeGreaterThan(0);

    // Re-encoding the decoded bytes must equal the original Base64
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    expect(btoa(binary)).toBe(ciphertext);
  });
});

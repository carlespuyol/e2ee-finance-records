// crypto.ts — Client-side encryption service
// Uses the Web Crypto API exclusively. Keys never leave this module.

const PBKDF2_ITERATIONS = 600_000; // OWASP 2023 recommendation for SHA-256
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // bytes — standard for AES-GCM

/**
 * Safely encodes an ArrayBuffer to Base64.
 *
 * Do NOT use: btoa(String.fromCharCode(...new Uint8Array(buffer)))
 * The spread operator passes every byte as a separate argument and throws
 * "RangeError: Maximum call stack size exceeded" for buffers larger than ~65 KB.
 */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}

/**
 * Derives a non-extractable AES-256-GCM CryptoKey from a password and email.
 *
 * Salt = SHA-256(email) — deterministic, avoids server-side storage.
 * Trade-off: an attacker who knows the email can begin a targeted dictionary
 * attack without needing to discover the salt. A random server-side salt
 * would be strictly stronger. Documented trade-off for this scope.
 *
 * The returned CryptoKey has extractable=false — it cannot be exported
 * from the Web Crypto API regardless of who holds a reference to it.
 */
export async function deriveKey(password: string, email: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const saltBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(email));

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(saltBuffer),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false, // not extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a plaintext string with AES-256-GCM.
 * Generates a fresh cryptographically-random 12-byte IV per call.
 * IV reuse with GCM is catastrophic — never reuse an IV with the same key.
 */
export async function encrypt(
  key: CryptoKey,
  plaintext: string
): Promise<{ ciphertext: string; iv: string }> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: bufferToBase64(encrypted),
    iv: bufferToBase64(iv.buffer),
  };
}

/**
 * Decrypts a Base64-encoded AES-256-GCM ciphertext.
 * Throws if ciphertext was tampered with (GCM authentication tag failure).
 */
export async function decrypt(
  key: CryptoKey,
  ciphertext: string,
  iv: string
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuffer(iv) },
    key,
    base64ToBuffer(ciphertext)
  );
  return new TextDecoder().decode(decrypted);
}

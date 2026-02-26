// Centralised configuration — loaded once at startup.
// The process exits immediately if required env vars are absent,
// preventing silent use of insecure fallback values.

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required but not set.');
}

export const JWT_SECRET: string = process.env.JWT_SECRET;
export const JWT_EXPIRY = '24h';
export const BCRYPT_ROUNDS = 12;

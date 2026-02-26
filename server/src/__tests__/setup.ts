// NOTE: env vars (DATABASE_PATH, JWT_SECRET, CLIENT_ORIGIN) are set in vitest.config.mjs
// via test.env — this guarantees they are applied before any module is imported.
// Do NOT set process.env here: TypeScript hoists imports before synchronous code runs.

import { beforeEach } from 'vitest';
import db from '../db';
import request from 'supertest';
import { app } from '../index';

// Reset tables between every test for isolation
beforeEach(() => {
  db.exec('DELETE FROM records');
  db.exec('DELETE FROM users');
});

/**
 * Registers a user via the API and returns their JWT token and userId.
 * Used as a helper across multiple test files.
 */
export async function createUserAndToken(
  email = 'test@example.com',
  password = 'password123'
): Promise<{ token: string; userId: number; email: string }> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password });

  if (res.status !== 201) {
    throw new Error(`createUserAndToken failed: ${JSON.stringify(res.body)}`);
  }

  return { token: res.body.token, userId: res.body.user.id, email: res.body.user.email };
}

export { db, app, request };

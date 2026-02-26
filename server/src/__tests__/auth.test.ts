import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { app, request, db, createUserAndToken } from './setup';

const JWT_SECRET = process.env.JWT_SECRET!;

describe('POST /api/auth/register', () => {
  it('returns 201 with token and user on valid input', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'securepass' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('alice@example.com');
    expect(res.body.user.id).toBeTypeOf('number');
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ password: 'securepass' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 character/i);
  });

  it('returns 400 on duplicate email without revealing the email is taken', async () => {
    await createUserAndToken('alice@example.com');
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'securepass' });
    // 400 (not 409) so the response code does not confirm the email is registered
    expect(res.status).toBe(400);
    expect(res.body.error).not.toBe('Email already registered');
  });

  it('normalises email: registers with mixed case, login succeeds with lowercase', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: ' ALICE@EXAMPLE.COM ', password: 'securepass' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'securepass' });
    expect(res.status).toBe(200);
  });

  it('stores password as a bcrypt hash, not plaintext', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'securepass' });

    const row = db.prepare('SELECT password_hash FROM users WHERE email = ?')
      .get('alice@example.com') as { password_hash: string };

    expect(row.password_hash).not.toBe('securepass');
    expect(row.password_hash).toMatch(/^\$2b\$/); // bcrypt prefix
    expect(await bcrypt.compare('securepass', row.password_hash)).toBe(true);
  });

  it('response does not contain password_hash field', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'securepass' });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('password_hash');
    expect(body).not.toContain('password');
    expect(body).not.toContain('hash');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await createUserAndToken('alice@example.com', 'securepass');
  });

  it('returns 200 with JWT on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'securepass' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('alice@example.com');
  });

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for unknown email with the same message as wrong password (no user enumeration)', async () => {
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'securepass' });

    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'wrongpassword' });

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    // Identical error message — prevents user enumeration
    expect(unknown.body.error).toBe(wrong.body.error);
  });

  it('JWT payload contains userId and email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'securepass' });

    const payload = jwt.verify(res.body.token, JWT_SECRET) as { userId: number; email: string };
    expect(payload.userId).toBeTypeOf('number');
    expect(payload.email).toBe('alice@example.com');
  });

  it('constant-time protection: bcrypt.compare is called for unknown-email path (structural test)', async () => {
    // Spy on bcrypt.compare to verify it is always called — even when user does not exist.
    // This confirms the server does not short-circuit before bcrypt, which would leak timing info.
    const spy = vi.spyOn(bcrypt, 'compare');

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'anypassword' });

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('response does not expose password or hash fields', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'securepass' });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('password_hash');
    expect(body).not.toContain('password');
    expect(body).not.toContain('hash');
  });
});

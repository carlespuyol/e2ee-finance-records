import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { app, request } from './setup';

const JWT_SECRET = process.env.JWT_SECRET!;

// Use the health endpoint to test middleware indirectly, and records for protected routes
describe('requireAuth middleware', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app).get('/api/records');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing or invalid/i);
  });

  it('returns 401 when Authorization header has no Bearer prefix', async () => {
    const res = await request(app)
      .get('/api/records')
      .set('Authorization', 'Basic abc123');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing or invalid/i);
  });

  it('returns 401 for a malformed/invalid JWT string', async () => {
    const res = await request(app)
      .get('/api/records')
      .set('Authorization', 'Bearer not.a.real.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  it('returns 401 for an expired JWT', async () => {
    const expired = jwt.sign({ userId: 1, email: 'x@x.com' }, JWT_SECRET, { expiresIn: -1 });
    const res = await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  it('passes through to the route handler with a valid JWT', async () => {
    const valid = jwt.sign({ userId: 999, email: 'x@x.com' }, JWT_SECRET, { expiresIn: '1h' });
    // GET /api/records with a valid token — no records exist, returns 200 with empty array
    const res = await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${valid}`);
    expect(res.status).toBe(200);
    expect(res.body.records).toEqual([]);
  });
});

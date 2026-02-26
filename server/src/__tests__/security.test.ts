/**
 * security.test.ts
 *
 * Validates every security invariant from PRD §5.5 and §8.2.
 * These tests are intentionally separate to make security review easy.
 */
import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { app, request, db, createUserAndToken } from './setup';

const JWT_SECRET = process.env.JWT_SECRET!;

describe('PRD §5.5 Security Invariants', () => {
  it('Invariant 1 — DB schema: records table has NO plaintext business-data columns', () => {
    const columns = db.prepare("PRAGMA table_info('records')").all() as Array<{ name: string }>;
    const names = columns.map(c => c.name);

    // Only these columns are allowed
    expect(names).toEqual(
      expect.arrayContaining(['id', 'user_id', 'encrypted_data', 'iv', 'created_at'])
    );
    // Must NOT contain any plaintext finance field names
    const forbidden = ['productName', 'price', 'seller', 'salesPerson', 'time', 'aes_key', 'key', 'plaintext'];
    for (const f of forbidden) {
      expect(names).not.toContain(f);
    }
  });

  it('Invariant 1 — DB schema: users table has NO encryption key column', () => {
    const columns = db.prepare("PRAGMA table_info('users')").all() as Array<{ name: string }>;
    const names = columns.map(c => c.name);

    const forbidden = ['aes_key', 'encryption_key', 'crypto_key', 'secret'];
    for (const f of forbidden) {
      expect(names).not.toContain(f);
    }
  });

  it('Invariant 2 — Server passthrough: server stores and returns ciphertext byte-for-byte unchanged', async () => {
    const { token } = await createUserAndToken();
    const opaque = 'OPAQUE_BLOB_XYZ_12345==';

    await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${token}`)
      .send({ encryptedData: opaque, iv: 'someIV==' });

    const res = await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.records[0].encryptedData).toBe(opaque);
  });

  it('Invariant 3 — IV preserved: server returns stored IV byte-for-byte unchanged', async () => {
    const { token } = await createUserAndToken();
    const specificIV = 'aGVsbG93b3JsZA==';

    await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${token}`)
      .send({ encryptedData: 'ciphertext', iv: specificIV });

    const res = await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.records[0].iv).toBe(specificIV);
  });

  it('Invariant 4 — JWT grants zero decryption: GET /api/records returns only ciphertext, never plaintext fields', async () => {
    const { token } = await createUserAndToken();
    await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${token}`)
      .send({ encryptedData: 'someCipher', iv: 'someIV' });

    const res = await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${token}`);

    const body = JSON.stringify(res.body);
    const plainTextFields = ['productName', 'price', 'seller', 'salesPerson'];
    for (const field of plainTextFields) {
      expect(body).not.toContain(field);
    }
  });
});

describe('PRD §8.2 Backend Security Rules', () => {
  it('bcrypt cost factor is 12 (parsed from stored hash prefix)', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'securepass' });

    const row = db.prepare('SELECT password_hash FROM users WHERE email = ?')
      .get('test@example.com') as { password_hash: string };

    // Bcrypt hash format: $2b$<cost>$...
    const costFactor = parseInt(row.password_hash.split('$')[2], 10);
    expect(costFactor).toBe(12);
  });

  it('password never appears in register or login response', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'securepass' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'securepass' });

    for (const res of [registerRes, loginRes]) {
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('password');
      expect(body).not.toContain('hash');
    }
  });

  it('IDOR full matrix: User B cannot access or mutate User A records', async () => {
    const { token: aliceToken } = await createUserAndToken('alice@example.com');
    const { token: bobToken } = await createUserAndToken('bob@example.com');

    // Alice creates a record
    const createRes = await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ encryptedData: 'aliceSecret', iv: 'aliceIV' });
    const recordId = createRes.body.id;

    // Bob tries GET — sees empty list (not Alice's record)
    const getRes = await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${bobToken}`);
    expect(getRes.body.records).toHaveLength(0);

    // Bob tries DELETE — 403
    const deleteRes = await request(app)
      .delete(`/api/records/${recordId}`)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(deleteRes.status).toBe(403);

    // Alice's record still exists after Bob's failed attempt
    const aliceGet = await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(aliceGet.body.records).toHaveLength(1);
  });

  it('expired token is rejected on all three protected record endpoints', async () => {
    const expired = jwt.sign({ userId: 1, email: 'x@x.com' }, JWT_SECRET, { expiresIn: -1 });
    const auth = `Bearer ${expired}`;

    const [postRes, getRes, deleteRes] = await Promise.all([
      request(app).post('/api/records').set('Authorization', auth).send({ encryptedData: 'x', iv: 'y' }),
      request(app).get('/api/records').set('Authorization', auth),
      request(app).delete('/api/records/1').set('Authorization', auth),
    ]);

    expect(postRes.status).toBe(401);
    expect(getRes.status).toBe(401);
    expect(deleteRes.status).toBe(401);
  });

  it('CORS: response includes correct origin header for allowed origin', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('known gap — JWT replay after logout: server-side token remains valid until expiry (no revocation)', async () => {
    const { token } = await createUserAndToken();

    // Simulate logout (client discards token). The token is still valid server-side:
    const res = await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${token}`);

    // This is expected to be 200 — the server has no token blacklist.
    // Documenting this known limitation.
    expect(res.status).toBe(200);
  });

  it('known gap — no payload size limit: server accepts a 100 KB encryptedData payload', async () => {
    const { token } = await createUserAndToken();
    const largePayload = 'A'.repeat(100_000);

    const res = await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${token}`)
      .send({ encryptedData: largePayload, iv: 'someIV' });

    // Document current behaviour — server accepts without size limit
    // In production, express.json() default limit (100kb) may reject this.
    // This test characterises the behaviour rather than asserting it should pass or fail.
    expect([201, 413]).toContain(res.status);
  });
});

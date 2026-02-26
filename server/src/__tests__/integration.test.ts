/**
 * Integration tests — chains multiple operations across the full HTTP stack.
 *
 * Unlike the unit tests (which validate individual route handlers in isolation),
 * these tests exercise complete user flows:  register → login → CRUD → verify.
 * Each test uses a real in-memory SQLite database via the shared setup.ts.
 */

import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { request, app, createUserAndToken } from './setup';

const JWT_SECRET = process.env.JWT_SECRET!;

// ---------------------------------------------------------------------------
// 1. Full record lifecycle — happy path
// ---------------------------------------------------------------------------

describe('Integration: full record lifecycle', () => {
  it('register → login → create record → list → delete → list empty', async () => {
    // Register
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'lifecycle@example.com', password: 'lifecycle-pass' });
    expect(regRes.status).toBe(201);

    // Login with same credentials to get a fresh JWT
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'lifecycle@example.com', password: 'lifecycle-pass' });
    expect(loginRes.status).toBe(200);
    const { token } = loginRes.body;

    // Create a record using the login-issued token
    const postRes = await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${token}`)
      .send({ encryptedData: 'U29tZUNpcGhlcnRleHQ=', iv: 'U29tZUlW' });
    expect(postRes.status).toBe(201);
    const { id } = postRes.body;
    expect(typeof id).toBe('number');

    // List: the new record is present
    const listRes = await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.records).toHaveLength(1);
    expect(listRes.body.records[0].id).toBe(id);

    // Delete
    const delRes = await request(app)
      .delete(`/api/records/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(204);

    // List again: empty
    const emptyRes = await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${token}`);
    expect(emptyRes.status).toBe(200);
    expect(emptyRes.body.records).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. E2EE server passthrough — full HTTP round-trip
// ---------------------------------------------------------------------------

describe('Integration: E2EE server passthrough (full HTTP round-trip)', () => {
  it('ciphertext and IV are returned byte-for-byte after write → read cycle', async () => {
    const { token } = await createUserAndToken();

    const sentCiphertext = 'SGVsbG8gV29ybGQhIFRoaXMgaXMgYSB0ZXN0IGNpcGhlcnRleHQ=';
    const sentIv = 'dGVzdC1pdi0xMg==';

    await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${token}`)
      .send({ encryptedData: sentCiphertext, iv: sentIv })
      .expect(201);

    const getRes = await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const [record] = getRes.body.records;
    expect(record.encryptedData).toBe(sentCiphertext);
    expect(record.iv).toBe(sentIv);
  });
});

// ---------------------------------------------------------------------------
// 3. Multi-user data isolation
// ---------------------------------------------------------------------------

describe('Integration: multi-user data isolation', () => {
  it('users see only their own records; cross-user deletion is forbidden', async () => {
    const alice = await createUserAndToken('alice@example.com', 'alice-pass-123');
    const bob   = await createUserAndToken('bob@example.com',   'bob-pass-456');

    // Alice creates 3 records
    const aliceIds: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${alice.token}`)
        .send({ encryptedData: `YWxpY2UtY2lwaGVy${i}`, iv: `YWxpY2UtaXY${i}` });
      aliceIds.push(res.body.id as number);
    }

    // Bob creates 2 records
    const bobIds: number[] = [];
    for (let i = 0; i < 2; i++) {
      const res = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${bob.token}`)
        .send({ encryptedData: `Ym9iLWNpcGhlcg${i}`, iv: `Ym9iLWl2${i}` });
      bobIds.push(res.body.id as number);
    }

    // Alice sees exactly her 3 records and none of Bob's
    const aliceGet = await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);
    expect(aliceGet.body.records).toHaveLength(3);
    const aliceReturnedIds = aliceGet.body.records.map((r: { id: number }) => r.id);
    bobIds.forEach(id => expect(aliceReturnedIds).not.toContain(id));

    // Bob sees exactly his 2 records and none of Alice's
    const bobGet = await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(200);
    expect(bobGet.body.records).toHaveLength(2);
    const bobReturnedIds = bobGet.body.records.map((r: { id: number }) => r.id);
    aliceIds.forEach(id => expect(bobReturnedIds).not.toContain(id));

    // Cross-user deletes are forbidden (403)
    await request(app)
      .delete(`/api/records/${aliceIds[0]}`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(403);

    await request(app)
      .delete(`/api/records/${bobIds[0]}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(403);

    // Each owner can delete their own records
    for (const id of aliceIds) {
      await request(app)
        .delete(`/api/records/${id}`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(204);
    }
    for (const id of bobIds) {
      await request(app)
        .delete(`/api/records/${id}`)
        .set('Authorization', `Bearer ${bob.token}`)
        .expect(204);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Token lifecycle across all protected endpoints
// ---------------------------------------------------------------------------

describe('Integration: token lifecycle across all protected endpoints', () => {
  it('valid token works on POST, GET, DELETE; expired token is rejected by all three', async () => {
    const { token } = await createUserAndToken();

    // Valid token works on all three endpoints
    const postRes = await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${token}`)
      .send({ encryptedData: 'Y2lwaGVydGV4dA==', iv: 'aXY=' })
      .expect(201);
    const { id } = postRes.body;

    await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app)
      .delete(`/api/records/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    // Expired token is rejected by all three endpoints
    const expiredToken = jwt.sign(
      { userId: 999, email: 'expired@example.com' },
      JWT_SECRET,
      { expiresIn: -1 }
    );

    await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${expiredToken}`)
      .send({ encryptedData: 'Y2lwaGVydGV4dA==', iv: 'aXY=' })
      .expect(401);

    await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);

    await request(app)
      .delete('/api/records/1')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
  });
});

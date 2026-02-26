import { describe, it, expect, beforeEach } from 'vitest';
import { app, request, createUserAndToken } from './setup';

describe('/api/records — auth enforcement', () => {
  it('POST without token → 401', async () => {
    const res = await request(app).post('/api/records').send({ encryptedData: 'x', iv: 'y' });
    expect(res.status).toBe(401);
  });

  it('GET without token → 401', async () => {
    const res = await request(app).get('/api/records');
    expect(res.status).toBe(401);
  });

  it('DELETE without token → 401', async () => {
    const res = await request(app).delete('/api/records/1');
    expect(res.status).toBe(401);
  });
});

describe('/api/records — create (POST)', () => {
  let token: string;

  beforeEach(async () => {
    ({ token } = await createUserAndToken());
  });

  it('valid POST returns 201 with id and createdAt — no plaintext record fields', async () => {
    const res = await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${token}`)
      .send({ encryptedData: 'c2VjcmV0', iv: 'aXYxMjM0NTY=' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTypeOf('number');
    expect(res.body.createdAt).toBeTruthy();
    // Response must NOT contain any plaintext finance field names
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('productName');
    expect(body).not.toContain('price');
    expect(body).not.toContain('seller');
    expect(body).not.toContain('salesPerson');
  });

  it('missing encryptedData → 400', async () => {
    const res = await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${token}`)
      .send({ iv: 'aXYxMjM0NTY=' });
    expect(res.status).toBe(400);
  });

  it('missing iv → 400', async () => {
    const res = await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${token}`)
      .send({ encryptedData: 'c2VjcmV0' });
    expect(res.status).toBe(400);
  });
});

describe('/api/records — read (GET)', () => {
  it("returns only the authenticated user's own records", async () => {
    const { token } = await createUserAndToken('alice@example.com');
    await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${token}`)
      .send({ encryptedData: 'aliceCipher', iv: 'aliceIV' });

    const res = await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(1);
    expect(res.body.records[0].encryptedData).toBe('aliceCipher');
  });

  it('a fresh user sees no records from other users', async () => {
    const { token: aliceToken } = await createUserAndToken('alice@example.com');
    await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ encryptedData: 'aliceCipher', iv: 'aliceIV' });

    const { token: bobToken } = await createUserAndToken('bob@example.com');
    const res = await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${bobToken}`);

    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(0);
  });
});

describe('/api/records — delete (DELETE)', () => {
  let aliceToken: string;
  let recordId: number;

  beforeEach(async () => {
    ({ token: aliceToken } = await createUserAndToken('alice@example.com'));
    const createRes = await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ encryptedData: 'aliceCipher', iv: 'aliceIV' });
    recordId = createRes.body.id;
  });

  it('owner can delete their own record → 204', async () => {
    const res = await request(app)
      .delete(`/api/records/${recordId}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(204);
  });

  it('non-integer id → 400', async () => {
    const res = await request(app)
      .delete('/api/records/abc')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(400);
  });

  it('non-existent id → 404', async () => {
    const res = await request(app)
      .delete('/api/records/99999')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(404);
  });

  it('IDOR: user B cannot delete user A\'s record → 403', async () => {
    const { token: bobToken } = await createUserAndToken('bob@example.com');
    const res = await request(app)
      .delete(`/api/records/${recordId}`)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(res.status).toBe(403);
  });
});

describe('/api/records — data isolation & SQL injection resistance', () => {
  it("Alice's records are not returned in Bob's GET", async () => {
    const { token: aliceToken } = await createUserAndToken('alice@example.com');
    const { token: bobToken } = await createUserAndToken('bob@example.com');

    await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ encryptedData: 'ALICE_DATA', iv: 'IV_A' });

    const bobRes = await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${bobToken}`);

    expect(bobRes.body.records).toHaveLength(0);
  });

  it('SQL injection in encryptedData is stored and returned verbatim (parameterised queries)', async () => {
    const { token } = await createUserAndToken();
    const malicious = "'; DROP TABLE records; --";

    await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${token}`)
      .send({ encryptedData: malicious, iv: 'safeIV' });

    const getRes = await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${token}`);

    // Table still exists and contains the injected string as-is
    expect(getRes.body.records).toHaveLength(1);
    expect(getRes.body.records[0].encryptedData).toBe(malicious);
  });

  it('script tags in iv field are stored and returned verbatim (no XSS transformation)', async () => {
    const { token } = await createUserAndToken();
    const xssAttempt = '<script>alert(1)</script>';

    await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${token}`)
      .send({ encryptedData: 'cipher', iv: xssAttempt });

    const getRes = await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.body.records[0].iv).toBe(xssAttempt);
  });

  it('server accepts arbitrary garbage as encryptedData (server is opaque to ciphertext content)', async () => {
    const { token } = await createUserAndToken();
    const res = await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${token}`)
      .send({ encryptedData: 'AAAAAAAAAA', iv: 'BBBBBBBBBBBB' });

    expect(res.status).toBe(201);
  });
});

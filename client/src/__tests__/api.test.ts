import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../services/api';

// ─── Mock fetch ──────────────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = mockFetch(200, {});
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('api.ts — HTTP client', () => {
  it('1. JWT sent as Authorization: Bearer <token> header', async () => {
    fetchMock = mockFetch(200, { records: [] });
    vi.stubGlobal('fetch', fetchMock);

    await api.getRecords('my-test-token');

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['Authorization']).toBe('Bearer my-test-token');
  });

  it('2. request without token has no Authorization header', async () => {
    fetchMock = mockFetch(200, { token: 'x', user: { id: 1, email: 'a@a.com' } });
    vi.stubGlobal('fetch', fetchMock);

    await api.login('a@a.com', 'pass');

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['Authorization']).toBeUndefined();
  });

  it('3. 204 response returns undefined', async () => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve(null) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.deleteRecord('token', 1);
    expect(result).toBeUndefined();
  });

  it('4. non-OK response throws an Error with .status property', async () => {
    fetchMock = mockFetch(401, { error: 'Unauthorized' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.getRecords('bad-token')).rejects.toMatchObject({
      message: 'Unauthorized',
      status: 401,
    });
  });

  it('5. register sends email and password in POST body', async () => {
    fetchMock = mockFetch(201, { token: 'x', user: { id: 1, email: 'a@a.com' } });
    vi.stubGlobal('fetch', fetchMock);

    await api.register('a@a.com', 'password123');

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.email).toBe('a@a.com');
    expect(body.password).toBe('password123');
  });

  it('6. login sends email and password in POST body', async () => {
    fetchMock = mockFetch(200, { token: 'x', user: { id: 1, email: 'a@a.com' } });
    vi.stubGlobal('fetch', fetchMock);

    await api.login('a@a.com', 'password123');

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.email).toBe('a@a.com');
    expect(body.password).toBe('password123');
  });

  it('7. createRecord sends encryptedData and iv — NOT plaintext record fields', async () => {
    fetchMock = mockFetch(201, { id: 1, createdAt: 'now' });
    vi.stubGlobal('fetch', fetchMock);

    await api.createRecord('token', 'base64cipher==', 'base64iv==');

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);

    // Must send only encrypted fields
    expect(body.encryptedData).toBe('base64cipher==');
    expect(body.iv).toBe('base64iv==');

    // Must NOT send any plaintext record fields
    expect(body.productName).toBeUndefined();
    expect(body.price).toBeUndefined();
    expect(body.seller).toBeUndefined();
    expect(body.salesPerson).toBeUndefined();
    expect(body.time).toBeUndefined();
  });

  it('8. deleteRecord issues DELETE to /records/:id', async () => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve(null) });
    vi.stubGlobal('fetch', fetchMock);

    await api.deleteRecord('token', 42);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/records/42');
    expect(options.method).toBe('DELETE');
  });
});

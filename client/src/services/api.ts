// api.ts — HTTP client
// The JWT token is always passed as a parameter (read from AuthContext in memory).
// It is NEVER read from localStorage, sessionStorage, or cookies.

import { StoredEncryptedRecord } from '../types';

const BASE = '/api';

interface ApiError extends Error {
  status: number;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    const err = new Error(body.error || 'Request failed') as ApiError;
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface AuthResponse {
  token: string;
  user: { id: number; email: string };
}

export const api = {
  register(email: string, password: string) {
    return request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  login(email: string, password: string) {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  getRecords(token: string) {
    return request<{ records: StoredEncryptedRecord[] }>('/records', {}, token);
  },

  createRecord(token: string, encryptedData: string, iv: string) {
    return request<{ id: number; createdAt: string }>(
      '/records',
      { method: 'POST', body: JSON.stringify({ encryptedData, iv }) },
      token
    );
  },

  deleteRecord(token: string, id: number) {
    return request<void>(`/records/${id}`, { method: 'DELETE' }, token);
  },
};

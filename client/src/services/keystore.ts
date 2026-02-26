// keystore.ts — Session persistence
//
// Split storage strategy:
//   JWT + user metadata → localStorage  (survives page refresh + browser close, up to JWT expiry)
//   CryptoKey          → IndexedDB      (browser serialises it with extractable:false intact;
//                                        raw key bytes are NEVER visible to JavaScript)
//
// On restore: load metadata from localStorage + CryptoKey from IndexedDB.
// Password is NEVER stored anywhere.

const STORAGE_KEY = 'sv_session';

const IDB_NAME = 'sv_keystore';
const IDB_STORE = 'keys';
const IDB_KEY_ID = 'main';

// ─── localStorage: JWT + user metadata ───────────────────────────────────────

interface SessionMeta {
  token: string;
  userId: number;
  email: string;
}

function saveMeta(meta: SessionMeta): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // localStorage may be unavailable in some private-browsing modes
  }
}

function isSessionMeta(v: unknown): v is SessionMeta {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as SessionMeta).token === 'string' &&
    typeof (v as SessionMeta).userId === 'number' &&
    typeof (v as SessionMeta).email === 'string'
  );
}

function loadMeta(): SessionMeta | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSessionMeta(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function clearMeta(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ─── IndexedDB: CryptoKey ─────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveKey(key: CryptoKey): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(key, IDB_KEY_ID);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function loadKey(): Promise<CryptoKey | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY_ID);
    req.onsuccess = () => { db.close(); resolve((req.result as CryptoKey) ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function clearKey(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_KEY_ID);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // IndexedDB unavailable — nothing to clear
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Persists the JWT metadata to localStorage and the CryptoKey to IndexedDB. */
export async function saveSession(
  meta: { token: string; userId: number; email: string },
  cryptoKey: CryptoKey
): Promise<void> {
  saveMeta(meta);
  await saveKey(cryptoKey);
}

/**
 * Restores a previously saved session.
 * Returns null if no session exists, the JWT has expired, or the CryptoKey is missing.
 */
export async function loadSession(): Promise<{
  token: string;
  userId: number;
  email: string;
  cryptoKey: CryptoKey;
} | null> {
  const meta = loadMeta();
  if (!meta) return null;

  // Validate JWT expiry by parsing the payload (full verification happens server-side).
  // Normalize Base64Url → Base64 before atob: JWT uses '-' and '_' instead of '+' and '/'.
  try {
    const b64 = meta.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64)) as { exp: number };
    if (payload.exp * 1000 <= Date.now()) {
      clearMeta();
      return null;
    }
  } catch {
    clearMeta();
    return null;
  }

  const cryptoKey = await loadKey();
  if (!cryptoKey) {
    clearMeta(); // keep storage consistent
    return null;
  }

  return { ...meta, cryptoKey };
}

/** Removes session data from both localStorage and IndexedDB. */
export function clearSession(): void {
  clearMeta();
  clearKey(); // fire-and-forget — state is cleared synchronously above
}

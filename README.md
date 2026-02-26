# SecureFinance — E2EE Finance Records

A production-quality web application for storing sensitive finance records with **end-to-end encryption**. Records are encrypted entirely on the client before upload; the server stores and returns only ciphertext and never possesses the ability to decrypt.

---

## Prerequisites

### Node.js ≥ 20.19

Vite 6 requires Node 20.19+. **Node 20 LTS** is recommended.

**Amazon Linux 2023 / RHEL:**
```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

**Ubuntu / Debian:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs
```

**Windows:** Install from [nodejs.org](https://nodejs.org) (LTS). Run cert scripts in **Git Bash**.

---

## Quick Start

```bash
cd e2ee-finance-records

# Step 1 — generate TLS certificates (one-time)
bash scripts/generate-certs.sh

# Step 2 — install dependencies
npm install
npm install --prefix server
npm install --prefix client

# Step 3 — run dev servers
npm run dev
```

Open **https://localhost:5173**. The server runs on **https://localhost:3003**.

> **Browser warning:** On first visit the browser will show an "untrusted certificate" warning. Click *Advanced → Proceed to localhost* to continue. To suppress it permanently, add `certs/cert.pem` to your OS or browser trust store.

> **Windows:** Run the cert script in Git Bash (OpenSSL ships with Git for Windows).

> **`better-sqlite3`** uses native bindings. On Windows you may need [Build Tools for Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/) if prebuilt binaries are unavailable for your Node version. Node 20 LTS has prebuilt binaries available.

### Cloud deployment

The Vite dev server binds to `0.0.0.0`, so it is reachable at `https://<machine-ip>:5173`. The Express API server also binds to all interfaces on port 3003.

**Step 1 — generate a cert that includes the cloud machine's public IP or domain:**

```bash
# Replace 1.2.3.4 with your cloud machine's actual public IP or domain
bash scripts/generate-certs.sh 1.2.3.4
# or
bash scripts/generate-certs.sh myapp.example.com
```

`localhost` and `127.0.0.1` are always included; extra args are appended as additional SANs.

**Step 2 — set env vars:**

```bash
# Copy the generated cert files (scp, rsync, etc.)
# scp -r certs/ user@1.2.3.4:/path/to/app/certs/

# Set in the server's .env (or shell environment)
CLIENT_ORIGIN=https://1.2.3.4:5173
# Optional — only needed if cert files are not at ../certs/ relative to server/
# TLS_KEY_PATH=/path/to/key.pem
# TLS_CERT_PATH=/path/to/cert.pem
```

**Step 3 — run:**

```bash
npm run dev   # or npm start for production build
```

Access the app at `https://1.2.3.4:5173`. The Vite proxy forwards `/api` requests to `https://localhost:3003` on the same machine — no extra config needed.

> For a CA-signed certificate (no browser warning) use Let's Encrypt / Certbot instead of `generate-certs.sh`.

---

## Architecture

```
┌─────────────────────── BROWSER ──────────────────────────┐
│                                                           │
│  LoginPage          DashboardPage                         │
│      │                    │                               │
│      │         ┌──────────┴──────────┐                   │
│      │         │                     │                    │
│      │    RecordForm            RecordList                │
│      │         │                     │                    │
│      └────┬────┘    CryptoService    │                    │
│           │       (Web Crypto API)   │                    │
│           │     deriveKey / encrypt / decrypt             │
│           │               │                              │
│           └───── API Client (fetch + JWT from memory) ────┘
│                                                           │
│  Keystore: JWT → localStorage  |  CryptoKey → IndexedDB  │
│                            │
│                    ciphertext only
│                            │ HTTPS
└────────────────────────────┼──────────────────────────────┘
                             ▼
┌─────────────────── SERVER (Express) ─────────────────────┐
│                                                           │
│   POST /api/auth/register    POST /api/auth/login         │
│   GET  /api/records          POST /api/records            │
│   DELETE /api/records/:id                                 │
│                                                           │
│                      SQLite DB                            │
│            (stores only ciphertext + IV)                  │
└───────────────────────────────────────────────────────────┘
```

**Critical invariant:** The arrow crossing the client→server boundary carries **only ciphertext**. The server never sees plaintext record data, encryption keys, or passphrases.

---

## Encryption Design

### Key Derivation (PBKDF2)

```
password + SHA-256(email) → PBKDF2(600,000 iter, SHA-256) → 256-bit AES key
```

- **Algorithm:** PBKDF2 with SHA-256
- **Iterations:** 600,000 (OWASP 2023 recommendation)
- **Salt:** `SHA-256(email)` — deterministic, avoids server-side storage
- **Output:** Non-extractable `CryptoKey` for AES-256-GCM (`extractable: false`)

After login the key is held in React state (in-memory) for the session. To survive page refreshes without re-login, a **split persistence** strategy is used (`services/keystore.ts`):

- **JWT + user metadata** → `localStorage` (survives refresh, cleared on expiry)
- **CryptoKey** → `IndexedDB` (the browser serialises the key object with `extractable: false` intact; raw key bytes are **never visible to JavaScript**)

On app start, `AuthContext` calls `loadSession()` which validates the JWT's `exp` claim client-side and restores both the token and key to React state if still valid. If the JWT has expired or the CryptoKey is missing, the session is discarded and the user is redirected to login. The password itself is **never stored anywhere**.

### Encryption (AES-256-GCM)

- All record fields are serialised as a single JSON string and encrypted together
- A fresh cryptographically-random 12-byte IV is generated per record via `crypto.getRandomValues()`
- AES-GCM provides both confidentiality and integrity (tampered ciphertext is rejected on decrypt)

### What the Server Sees

| Data | Server access |
|---|---|
| User email | ✅ Yes (stored in users table) |
| Password | ✅ Yes — plaintext over HTTPS for bcrypt verification, then discarded |
| AES-256 key | ❌ Never — derived only in the browser |
| Record plaintext | ❌ Never — only ciphertext reaches the server |
| IV | ✅ Yes — safe to store; not secret, not sufficient to decrypt |

---

## Security Rationale

**Why AES-256-GCM?**
Authenticated encryption: confidentiality + integrity in one primitive. The authentication tag (automatically included by Web Crypto) detects any tampering with the ciphertext before decryption.

**Why PBKDF2 with 600,000 iterations?**
OWASP 2023 recommendation for PBKDF2-SHA256. High iteration count makes dictionary/brute-force attacks against the derived key computationally expensive. The `crypto.subtle.deriveKey` call is async and does not block the UI thread.

**Why `extractable: false`?**
The `CryptoKey` object cannot be exported from the Web Crypto API. Even if an attacker runs arbitrary JavaScript in the page (XSS), they cannot call `crypto.subtle.exportKey` on it.

**Why is each record's IV unique?**
IV reuse with GCM is catastrophic — it allows full key and plaintext recovery. `crypto.getRandomValues()` is used per encrypt call and never reused.

---

## Assumptions & Trade-offs

### E2EE Scope (important)

This design provides E2EE against a **passive attacker** — a compromised database exposes only ciphertext. It does **not** guarantee E2EE against a **malicious server**: the plaintext password is transmitted to the server over HTTPS for bcrypt verification. A compromised or malicious server could capture this password and independently run PBKDF2 to derive the AES key.

True E2EE against a malicious server would require a zero-knowledge authentication protocol (e.g. SRP — Secure Remote Password) or a separate encryption passphrase that is never transmitted. Both are out of scope for this assignment.

### PBKDF2 Salt

`SHA-256(email)` is used as a deterministic salt, avoiding any server-side storage. The trade-off: an attacker who knows the user's email and obtains the database can begin a targeted dictionary attack immediately, without needing to discover the salt. A random per-user salt stored in the `users` table would be strictly stronger but would introduce a server dependency that complicates the zero-server-trust story.

### Other Trade-offs

| Trade-off | Rationale |
|---|---|
| Password change invalidates all records | No key migration mechanism; by design for this scope. Documented limitation. |
| No key escrow or recovery | True E2EE — if the password is lost, records are unrecoverable. |
| JWT in localStorage is XSS-exposed | Required for session persistence across refreshes. Mitigated by `extractable: false` on the CryptoKey — an XSS attacker gets the JWT but cannot export the key. SameSite HttpOnly cookies would be stronger but require server-side session management. |
| Session persists across refreshes (up to JWT expiry) | JWT → localStorage, CryptoKey → IndexedDB. Password is never stored. Session is discarded when the JWT expires or the CryptoKey is missing. |
| SQLite single-writer | Fine for a demo. Not suitable for high-concurrency production. |
| JWT in `.env` | Use a secrets manager in production. |
| Rate limiting on auth endpoints only | 20 requests per 15-minute window per IP. No CSRF protection (stateless JWT, no cookies). |
| No pagination | `GET /api/records` returns all records. Acceptable for a demo. |

---

## Project Structure

```
e2ee-finance-records/
├── client/                        React 18 + Vite + TypeScript + Tailwind
│   └── src/
│       ├── contexts/AuthContext.tsx   Auth state + session restore on mount
│       ├── services/keystore.ts       Session persistence (localStorage + IndexedDB)
│       ├── services/crypto.ts         Web Crypto: deriveKey / encrypt / decrypt
│       ├── services/api.ts            Fetch wrapper — token passed as argument
│       ├── pages/LoginPage.tsx        Login / Register
│       ├── pages/DashboardPage.tsx    Records dashboard
│       └── components/
│           ├── RecordForm.tsx         Encrypt & upload form
│           └── RecordList.tsx         Decrypt & display table
├── server/                        Express + TypeScript + SQLite
│   └── src/
│       ├── db.ts                      Schema init (auto on startup)
│       ├── middleware/auth.ts          JWT verification
│       └── routes/
│           ├── auth.ts                Register + Login
│           └── records.ts             CRUD (ciphertext only)
├── .nvmrc                         Node 20 LTS
└── package.json                   Root dev/build scripts
```

---

## API Reference

```
POST /api/auth/register   { email, password }       → { token, user }
POST /api/auth/login      { email, password }       → { token, user }

GET    /api/records                                 → { records: [...] }
POST   /api/records       { encryptedData, iv }     → { id, createdAt }
DELETE /api/records/:id                             → 204
```

All `/api/records` endpoints require `Authorization: Bearer <JWT>`.

---

## Acceptance Criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Register and login | ✅ |
| 2 | Add a finance record via form | ✅ |
| 3 | Record encrypted before leaving browser | ✅ Network tab shows ciphertext only |
| 4 | DB stores only ciphertext | ✅ Open `database.sqlite` — no plaintext |
| 5 | View decrypted records after login | ✅ |
| 6 | Logout + re-login still decrypts old records | ✅ Same password → same derived key |
| 7 | Server code has zero plaintext record field references | ✅ |
| 8 | No keys or plaintext in server logs | ✅ Record endpoints never log body |
| 9 | Each record uses a unique IV | ✅ `crypto.getRandomValues()` per call |
| 10 | Clean, well-typed, minimal code | ✅ |
| 11 | Page refresh restores session without re-login | ✅ JWT → localStorage, CryptoKey → IndexedDB via `keystore.ts` |

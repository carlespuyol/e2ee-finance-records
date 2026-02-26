import 'dotenv/config';
import './config'; // validate required env vars at startup
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import recordRoutes from './routes/records';

const app = express();
const PORT = process.env.PORT || 3003;

// CORS: only allow the configured client origin (Vite dev server in development)
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'https://0.0.0.0:5173',
    credentials: true,
  })
);

app.use(express.json());

// Rate-limit authentication endpoints to slow down brute-force and enumeration attacks.
// Disabled in test environment (NODE_ENV=test) so test suites can make many rapid requests.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // max 20 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: () => process.env.NODE_ENV === 'test',
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/records', recordRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

export { app };

// Only start listening when this file is the entry point (not when imported by tests)
if (require.main === module) {
  const keyPath  = process.env.TLS_KEY_PATH  ?? path.resolve(process.cwd(), '..', 'certs', 'key.pem');
  const certPath = process.env.TLS_CERT_PATH ?? path.resolve(process.cwd(), '..', 'certs', 'cert.pem');

  let tlsOptions: { key: Buffer; cert: Buffer };
  try {
    tlsOptions = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  } catch {
    throw new Error(
      `TLS cert/key not found.\n  key:  ${keyPath}\n  cert: ${certPath}\nRun: bash scripts/generate-certs.sh`
    );
  }

  https.createServer(tlsOptions, app).listen(PORT, () => {
    console.log(`Server listening on https://0.0.0.0:${PORT}`);
  });
}

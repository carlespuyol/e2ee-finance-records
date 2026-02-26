import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../db';
import { JWT_SECRET, JWT_EXPIRY, BCRYPT_ROUNDS } from '../config';
import { User } from '../types';

const router = Router();

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }
  // bcrypt silently truncates passwords beyond 72 bytes; reject early with a clear message.
  if (password.length > 72) {
    res.status(400).json({ error: 'Password must be 72 characters or fewer' });
    return;
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = db
      .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
      .run(normalizedEmail, passwordHash);

    const token = jwt.sign(
      { userId: result.lastInsertRowid, email: normalizedEmail },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.status(201).json({
      token,
      user: { id: result.lastInsertRowid, email: normalizedEmail },
    });
  } catch (err: unknown) {
    const sqliteErr = err as { code?: string };
    if (sqliteErr.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      // Return 400 (not 409) to avoid confirming whether an email is registered.
      res.status(400).json({ error: 'Registration failed. If this email is already in use, try signing in instead.' });
    } else {
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();
    const user = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(normalizedEmail) as User | undefined;

    // Use constant-time comparison to prevent user enumeration timing attacks
    const dummyHash = '$2b$12$invalidhashforuserwhennotfound00000000000000000000000';
    const hashToCompare = user ? user.password_hash : dummyHash;
    const valid = await bcrypt.compare(password, hashToCompare);

    if (!user || !valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.json({ token, user: { id: user.id, email: user.email } });
  } catch {
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;

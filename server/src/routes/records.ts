import { Router, Request, Response, json } from 'express';
import db from '../db';
import { requireAuth } from '../middleware/auth';
import { EncryptedRecord } from '../types';

const router = Router();
router.use(requireAuth);

// Limit the POST body to 64 KB — sufficient for any encrypted finance record
// while preventing disk-filling abuse.
router.post('/', json({ limit: '64kb' }), (req: Request, res: Response): void => {
  const { encryptedData, iv } = req.body;

  if (
    !encryptedData || !iv ||
    typeof encryptedData !== 'string' ||
    typeof iv !== 'string'
  ) {
    res.status(400).json({ error: 'encryptedData and iv are required strings' });
    return;
  }

  try {
    const result = db
      .prepare('INSERT INTO records (user_id, encrypted_data, iv) VALUES (?, ?, ?)')
      .run(req.user!.userId, encryptedData, iv);

    const row = db
      .prepare('SELECT created_at FROM records WHERE id = ?')
      .get(result.lastInsertRowid) as { created_at: string };

    res.status(201).json({ id: result.lastInsertRowid, createdAt: row.created_at });
  } catch {
    res.status(500).json({ error: 'Failed to save record' });
  }
});

router.get('/', (req: Request, res: Response): void => {
  try {
    const rows = db
      .prepare(
        'SELECT id, encrypted_data, iv, created_at FROM records WHERE user_id = ? ORDER BY created_at DESC'
      )
      .all(req.user!.userId) as EncryptedRecord[];

    res.json({
      records: rows.map(r => ({
        id: r.id,
        encryptedData: r.encrypted_data,
        iv: r.iv,
        createdAt: r.created_at,
      })),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

router.delete('/:id', (req: Request, res: Response): void => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid record ID' });
    return;
  }

  try {
    const record = db
      .prepare('SELECT user_id FROM records WHERE id = ?')
      .get(id) as { user_id: number } | undefined;

    if (!record) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    // Prevent IDOR: ensure the record belongs to the authenticated user
    if (record.user_id !== req.user!.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    db.prepare('DELETE FROM records WHERE id = ?').run(id);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

export default router;

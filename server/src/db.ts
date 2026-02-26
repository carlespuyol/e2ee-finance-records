import Database from 'better-sqlite3';
import path from 'path';

// Allow tests to inject ':memory:' via DATABASE_PATH env var
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../database.sqlite');

const db = new Database(DB_PATH);

// WAL mode gives better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    email        TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS records (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL,
    encrypted_data TEXT NOT NULL,
    iv             TEXT NOT NULL,
    created_at     TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_records_user_id ON records(user_id);
`);

export default db;

import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import fs from 'fs'
import path from 'path'
import os from 'os'

const DB_DIR = path.join(os.homedir(), '.rchive')
const DB_PATH = path.join(DB_DIR, 'rchive.db')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  fs.mkdirSync(DB_DIR, { recursive: true })
  _db = new Database(DB_PATH)
  sqliteVec.load(_db)
  initSchema(_db)
  return _db
}

export function getDbPath(): string {
  return DB_PATH
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_conversation_id TEXT NOT NULL,
      title TEXT,
      summary TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      last_imported_at INTEGER,
      enriched INTEGER DEFAULT 0,
      UNIQUE(provider, provider_conversation_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      created_at INTEGER,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      content TEXT,
      embedding BLOB,
      topics TEXT,
      compression_summary TEXT,
      caveman_content TEXT,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      content,
      content='chunks',
      content_rowid='rowid'
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_provider ON conversations(provider);
    CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
    CREATE INDEX IF NOT EXISTS idx_conversations_enriched ON conversations(enriched);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_conversation_id ON chunks(conversation_id);
  `)
}

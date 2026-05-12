import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { diffAndImport } from '../src/db/diff.js'
import { NormalizedConversation } from '../src/types.js'

function makeTestDb(): Database.Database {
  const db = new Database(':memory:')
  sqliteVec.load(db)
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
  `)
  return db
}

const CONV: NormalizedConversation = {
  provider: 'chatgpt',
  provider_conversation_id: 'c1',
  title: 'Test',
  created_at: 1000,
  updated_at: 2000,
  messages: [{ role: 'user', content: 'hi', created_at: 1001 }],
}

test('inserts new conversations', () => {
  const db = makeTestDb()
  const stats = diffAndImport(db, [CONV])
  expect(stats.newCount).toBe(1)
  expect(stats.updatedCount).toBe(0)
  expect(stats.skippedCount).toBe(0)
  const row = db.prepare('SELECT * FROM conversations WHERE provider_conversation_id = ?').get('c1') as any
  expect(row.title).toBe('Test')
  const msgs = db.prepare('SELECT * FROM messages WHERE conversation_id = ?').all(row.id)
  expect(msgs).toHaveLength(1)
})

test('skips unchanged conversations', () => {
  const db = makeTestDb()
  diffAndImport(db, [CONV])
  const stats = diffAndImport(db, [CONV])
  expect(stats.newCount).toBe(0)
  expect(stats.updatedCount).toBe(0)
  expect(stats.skippedCount).toBe(1)
})

test('updates conversations with newer updated_at', () => {
  const db = makeTestDb()
  diffAndImport(db, [CONV])
  const updated = { ...CONV, updated_at: 3000, messages: [
    { role: 'user' as const, content: 'hi', created_at: 1001 },
    { role: 'assistant' as const, content: 'hello', created_at: 2000 },
  ]}
  const stats = diffAndImport(db, [updated])
  expect(stats.updatedCount).toBe(1)
  const row = db.prepare('SELECT * FROM conversations WHERE provider_conversation_id = ?').get('c1') as any
  expect(row.enriched).toBe(0)
  const msgs = db.prepare('SELECT * FROM messages WHERE conversation_id = ?').all(row.id)
  expect(msgs).toHaveLength(2)
})

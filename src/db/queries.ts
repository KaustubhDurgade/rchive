import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { NormalizedConversation, NormalizedMessage, Provider } from '../types'

const uuidv4 = randomUUID

export interface ConversationRow {
  id: string
  provider: string
  provider_conversation_id: string
  title: string | null
  summary: string | null
  created_at: number | null
  updated_at: number | null
  last_imported_at: number | null
  enriched: number
}

export interface ImportStats {
  newCount: number
  updatedCount: number
  skippedCount: number
}

export function getConversationByProviderKey(
  db: Database.Database,
  provider: Provider,
  providerConversationId: string
): ConversationRow | undefined {
  return db
    .prepare(
      'SELECT * FROM conversations WHERE provider = ? AND provider_conversation_id = ?'
    )
    .get(provider, providerConversationId) as ConversationRow | undefined
}

export function insertConversation(
  db: Database.Database,
  conv: NormalizedConversation
): string {
  const id = uuidv4()
  const now = Math.floor(Date.now() / 1000)
  db.prepare(`
    INSERT INTO conversations
      (id, provider, provider_conversation_id, title, summary, created_at, updated_at, last_imported_at, enriched)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    id,
    conv.provider,
    conv.provider_conversation_id,
    conv.title,
    conv.summary ?? null,
    conv.created_at,
    conv.updated_at,
    now
  )
  insertMessages(db, id, conv.messages)
  return id
}

export function updateConversation(
  db: Database.Database,
  existingId: string,
  conv: NormalizedConversation
): void {
  const now = Math.floor(Date.now() / 1000)
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(existingId)
  db.prepare(`
    UPDATE conversations
    SET title = ?, summary = ?, updated_at = ?, last_imported_at = ?, enriched = 0
    WHERE id = ?
  `).run(conv.title, conv.summary ?? null, conv.updated_at, now, existingId)
  insertMessages(db, existingId, conv.messages)
}

function insertMessages(
  db: Database.Database,
  conversationId: string,
  messages: NormalizedMessage[]
): void {
  const stmt = db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  for (const msg of messages) {
    stmt.run(uuidv4(), conversationId, msg.role, msg.content, msg.created_at)
  }
}

export function markEnriched(db: Database.Database, conversationId: string): void {
  db.prepare('UPDATE conversations SET enriched = 1 WHERE id = ?').run(conversationId)
}

export function getUnenrichedConversations(db: Database.Database): ConversationRow[] {
  return db
    .prepare('SELECT * FROM conversations WHERE enriched = 0')
    .all() as ConversationRow[]
}

export function getConversationById(
  db: Database.Database,
  id: string
): ConversationRow | undefined {
  return db
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .get(id) as ConversationRow | undefined
}

export function getMessagesByConversationId(
  db: Database.Database,
  conversationId: string
): { role: string; content: string; created_at: number }[] {
  return db
    .prepare('SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(conversationId) as { role: string; content: string; created_at: number }[]
}

export function getProviderStats(
  db: Database.Database
): { provider: string; total: number; last_imported_at: number | null; pending: number }[] {
  return db.prepare(`
    SELECT
      provider,
      COUNT(*) as total,
      MAX(last_imported_at) as last_imported_at,
      SUM(CASE WHEN enriched = 0 THEN 1 ELSE 0 END) as pending
    FROM conversations
    GROUP BY provider
  `).all() as { provider: string; total: number; last_imported_at: number | null; pending: number }[]
}

export function getTotalStats(db: Database.Database): { conversations: number; chunks: number } {
  const convRow = db.prepare('SELECT COUNT(*) as n FROM conversations').get() as { n: number }
  const chunkRow = db.prepare('SELECT COUNT(*) as n FROM chunks').get() as { n: number }
  return { conversations: convRow.n, chunks: chunkRow.n }
}

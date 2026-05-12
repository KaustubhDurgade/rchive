import Database from 'better-sqlite3'
import ora from 'ora'
import { randomUUID } from 'crypto'
import { getDb } from '../db/schema'
import { getUnenrichedConversations, getMessagesByConversationId, markEnriched } from '../db/queries'
import { getConfig, getGroqKey } from '../config'
import { chunkConversation } from './chunker'
import { embed } from './embeddings'
import { enrichChunk, summarizeConversation } from './groq'
import { enrichChunkOllama, summarizeConversationOllama } from './ollama'
import { runFirstTimeSetup } from './setup'
import { NormalizedMessage } from '../types'

export async function runEnrichmentPipeline(foreground: boolean): Promise<void> {
  await runFirstTimeSetup()

  const config = getConfig()
  if (!config.enrichmentProvider) {
    console.warn('[enrichment] No provider configured — skipping.')
    return
  }

  const db = getDb()
  const pending = getUnenrichedConversations(db)
  if (pending.length === 0) return

  const spinner = foreground ? ora(`Enriching ${pending.length} conversations...`).start() : null
  let done = 0

  const enrich = async () => {
    for (const conv of pending) {
      try {
        await enrichOne(db, conv.id, config)
        done++
        if (spinner) spinner.text = `Enriching... ${done}/${pending.length}`
      } catch (err) {
        console.warn(`[enrichment] Failed conversation ${conv.id}:`, (err as Error).message)
      }
      await yieldToEventLoop()
    }
    if (spinner) spinner.succeed(`Enriched ${done} conversations.`)
  }

  if (foreground) {
    await enrich()
  } else {
    setImmediate(() => enrich().catch((err) => console.error('[enrichment]', err.message)))
  }
}

async function enrichOne(
  db: Database.Database,
  conversationId: string,
  config: ReturnType<typeof getConfig>
): Promise<void> {
  const rows = getMessagesByConversationId(db, conversationId)
  const messages: NormalizedMessage[] = rows.map((r) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content ?? '',
    created_at: r.created_at,
  }))

  if (messages.length === 0) {
    markEnriched(db, conversationId)
    return
  }

  const chunks = chunkConversation(messages)
  const apiKey = config.enrichmentProvider === 'groq' ? await getGroqKey() : ''
  const ollamaModel = config.ollamaModel ?? 'phi3.5'

  // Conversation-level summary (from first 3 chunks)
  let convSummary = ''
  const existingSummary = (db.prepare('SELECT summary FROM conversations WHERE id = ?').get(conversationId) as { summary: string | null })?.summary
  if (!existingSummary) {
    convSummary = config.enrichmentProvider === 'groq'
      ? await summarizeConversation(chunks, apiKey)
      : await summarizeConversationOllama(chunks, ollamaModel)
    if (convSummary) {
      db.prepare('UPDATE conversations SET summary = ? WHERE id = ?').run(convSummary, conversationId)
    }
  }

  const insertChunk = db.prepare(`
    INSERT INTO chunks (id, conversation_id, content, embedding, topics, compression_summary, caveman_content)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  // better-sqlite3 transactions are synchronous, so we process chunks sequentially
  for (const chunkText of chunks) {
    const [enriched, embedding] = await Promise.all([
      config.enrichmentProvider === 'groq'
        ? enrichChunk(chunkText, apiKey)
        : enrichChunkOllama(chunkText, ollamaModel),
      embed(chunkText),
    ])

    const embeddingBuf = Buffer.from(embedding.buffer)
    insertChunk.run(
      randomUUID(),
      conversationId,
      chunkText,
      embeddingBuf,
      JSON.stringify(enriched.topics),
      enriched.summary,
      enriched.caveman
    )
    db.prepare("INSERT INTO chunks_fts(rowid, content) SELECT last_insert_rowid(), content FROM chunks WHERE rowid = last_insert_rowid()").run()
  }

  markEnriched(db, conversationId)
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

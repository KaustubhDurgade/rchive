import fs from 'fs'
import path from 'path'
import os from 'os'
import Database from 'better-sqlite3'
import ora from 'ora'
import { randomUUID } from 'crypto'
import { getDb } from '../db/schema.js'
import { getUnenrichedConversations, getMessagesByConversationId, markEnriched } from '../db/queries.js'
import { getConfig, getGroqKey } from '../config.js'
import { chunkConversation } from './chunker.js'
import { embed } from './embeddings.js'
import { summarizeConversation } from './groq.js'
import { enrichChunkOllama, summarizeConversationOllama, isModelPulled, pullModelWithProgress } from './ollama.js'
import { runFirstTimeSetup } from './setup.js'
import { NormalizedMessage } from '../types.js'

const LOG_PATH = path.join(os.homedir(), '.rchive', 'enrichment.log')

function makeLog(foreground: boolean): (msg: string) => void {
  if (foreground) return (msg) => console.warn(msg)
  return (msg) => {
    try {
      fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`)
    } catch { /* ignore */ }
  }
}

function bar(done: number, total: number, width = 20): string {
  if (total === 0) return '░'.repeat(width)
  const filled = Math.round((done / total) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

// Returns true if enrichment actually started, false if skipped.
export async function runEnrichmentPipeline(foreground: boolean, skipSetup = false): Promise<boolean> {
  if (!skipSetup) await runFirstTimeSetup()

  const config = getConfig()
  const model = config.ollamaModel
  const log = makeLog(foreground)

  if (!model) {
    log('[enrichment] No Ollama model configured. Run: rchive setup')
    return false
  }

  const db = getDb()
  const pending = getUnenrichedConversations(db)
  if (pending.length === 0) return true

  // Pull model on first use (or after model change)
  const pulled = await isModelPulled(model)
  if (!pulled) {
    const pullSpinner = foreground ? ora(`Pulling ${model} (first use)...`).start() : null
    try {
      await pullModelWithProgress(model, (pct, status) => {
        if (!pullSpinner) return
        if (pct !== null) pullSpinner.text = `Pulling ${model}... ${pct}%`
        else if (status && status !== 'success') pullSpinner.text = `Pulling ${model}: ${status}`
      })
      pullSpinner?.succeed(`${model} ready.`)
    } catch (err) {
      pullSpinner?.fail(`Failed to pull ${model}: ${(err as Error).message}`)
      log(`[enrichment] Cannot proceed: ${(err as Error).message}`)
      return false
    }
  }

  const total = pending.length
  const spinner = foreground ? ora('Starting…').start() : null
  let done = 0

  const enrich = async () => {
    for (const conv of pending) {
      const title = trunc(conv.title ?? conv.id, 40)
      try {
        await enrichOne(db, conv.id, config, log, (chunkDone, chunkTotal) => {
          if (!spinner) return
          const convBar = bar(done, total, 20)
          const chunkBar = bar(chunkDone, chunkTotal, 12)
          const convPct = Math.round((done / total) * 100)
          const chunkPct = chunkTotal > 0 ? Math.round((chunkDone / chunkTotal) * 100) : 0
          spinner.text =
            `[${done + 1}/${total}] ${title}\n` +
            `  conversations ${convBar} ${convPct}%\n` +
            `  chunks        ${chunkBar} ${chunkPct}%`
        })
        done++
      } catch (err) {
        log(`[enrichment] Failed conversation ${conv.id}: ${(err as Error).message}`)
        done++
      }
      await yieldToEventLoop()
    }
    spinner?.succeed(`Enriched ${done}/${total} conversations.`)
  }

  if (foreground) {
    await enrich()
  } else {
    setImmediate(() => enrich().catch((err) => log(`[enrichment] ${err.message}`)))
  }

  return true
}

async function enrichOne(
  db: Database.Database,
  conversationId: string,
  config: ReturnType<typeof getConfig>,
  log: (msg: string) => void,
  onChunkProgress?: (done: number, total: number) => void
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
  const model = config.ollamaModel ?? 'qwen2.5:3b'

  const existingSummary = (
    db.prepare('SELECT summary FROM conversations WHERE id = ?').get(conversationId) as { summary: string | null }
  )?.summary

  if (!existingSummary) {
    const groqKey = await getGroqKey()
    const convSummary = groqKey
      ? await summarizeConversation(chunks, groqKey)
      : await summarizeConversationOllama(chunks, model)
    if (convSummary) {
      db.prepare('UPDATE conversations SET summary = ? WHERE id = ?').run(convSummary, conversationId)
    }
  }

  const insertChunk = db.prepare(`
    INSERT INTO chunks (id, conversation_id, content, embedding, topics, compression_summary, caveman_content)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  for (let i = 0; i < chunks.length; i++) {
    onChunkProgress?.(i, chunks.length)
    const [enriched, embedding] = await Promise.all([
      enrichChunkOllama(chunks[i], model),
      embed(chunks[i]),
    ])
    const embeddingBuf = Buffer.from(embedding.buffer)
    insertChunk.run(
      randomUUID(), conversationId, chunks[i], embeddingBuf,
      JSON.stringify(enriched.topics), enriched.summary, enriched.caveman
    )
    db.prepare(
      'INSERT INTO chunks_fts(rowid, content) SELECT last_insert_rowid(), content FROM chunks WHERE rowid = last_insert_rowid()'
    ).run()
    onChunkProgress?.(i + 1, chunks.length)
  }

  markEnriched(db, conversationId)
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

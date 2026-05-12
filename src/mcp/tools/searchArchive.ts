import Database from 'better-sqlite3'
import { z } from 'zod'
import { hybridSearch } from '../../search/hybrid.js'
import { getMessagesByConversationId } from '../../db/queries.js'

const DECISION_TERMS = /decide|decision|summary|overview|what did i|chose|choice|conclusion/i
const CODE_TERMS = /code|function|class|bug|error|import|library|api|typescript|python|javascript|sql|config/i

export const searchArchiveSchema = z.object({
  query: z.string().describe('Search query'),
  limit: z.number().optional().default(5).describe('Number of results (default 5)'),
  compression: z
    .enum(['auto', 'summary', 'chunks', 'caveman', 'full'])
    .optional()
    .default('auto')
    .describe('Content compression tier'),
})

export async function handleSearchArchive(
  db: Database.Database,
  input: z.infer<typeof searchArchiveSchema>
): Promise<{ results: SearchArchiveResult[] } | { error: string; results: [] }> {
  try {
    const compression = resolveCompression(input.query, input.compression ?? 'auto')
    const results = await hybridSearch(db, input.query, input.limit ?? 5, compression)

    return {
      results: results.map((r) => {
        let content = r.content

        if (compression === 'full') {
          const messages = getMessagesByConversationId(db, r.conversation_id)
          content = messages
            .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
            .join('\n')
        } else if (compression === 'summary') {
          const row = db.prepare('SELECT compression_summary FROM chunks WHERE id = ?').get(r.chunk_id) as { compression_summary: string } | undefined
          content = row?.compression_summary ?? r.content
        } else if (compression === 'caveman') {
          const row = db.prepare('SELECT caveman_content FROM chunks WHERE id = ?').get(r.chunk_id) as { caveman_content: string } | undefined
          content = row?.caveman_content ?? r.content
        }

        return {
          chunk_id: r.chunk_id,
          conversation_id: r.conversation_id,
          conversation_title: r.conversation_title,
          provider: r.provider,
          created_at: r.created_at,
          content,
          topics: r.topics,
          relevance_score: r.relevance_score,
        }
      }),
    }
  } catch (err) {
    console.error('[mcp] search_archive error:', (err as Error).message)
    return { error: (err as Error).message, results: [] }
  }
}

interface SearchArchiveResult {
  chunk_id: string
  conversation_id: string
  conversation_title: string
  provider: string
  created_at: number
  content: string
  topics: string[]
  relevance_score: number
}

function resolveCompression(query: string, compression: string): string {
  if (compression !== 'auto') return compression
  if (DECISION_TERMS.test(query)) return 'summary'
  if (CODE_TERMS.test(query)) return 'chunks'
  return 'chunks'
}

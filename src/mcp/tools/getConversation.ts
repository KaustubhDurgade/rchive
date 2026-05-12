import Database from 'better-sqlite3'
import { z } from 'zod'
import { getConversationById, getMessagesByConversationId } from '../../db/queries.js'

export const getConversationSchema = z.object({
  conversation_id: z.string().describe('Conversation ID'),
  compression: z
    .enum(['summary', 'chunks', 'caveman', 'full'])
    .optional()
    .default('full')
    .describe('Content compression tier'),
})

export async function handleGetConversation(
  db: Database.Database,
  input: z.infer<typeof getConversationSchema>
): Promise<ConversationResult | { error: string }> {
  try {
    const conv = getConversationById(db, input.conversation_id)
    if (!conv) return { error: `Conversation not found: ${input.conversation_id}` }

    const compression = input.compression ?? 'full'
    let messages: { role: string; content: string; created_at: number }[]

    if (compression === 'summary') {
      const summary = conv.summary ?? ''
      messages = [{ role: 'summary', content: summary, created_at: conv.created_at ?? 0 }]
    } else if (compression === 'chunks' || compression === 'caveman') {
      const field = compression === 'caveman' ? 'caveman_content' : 'content'
      const rows = db
        .prepare(`SELECT ${field} as content FROM chunks WHERE conversation_id = ? ORDER BY rowid ASC`)
        .all(input.conversation_id) as { content: string }[]
      messages = rows.map((r) => ({ role: 'chunk', content: r.content, created_at: 0 }))
    } else {
      messages = getMessagesByConversationId(db, input.conversation_id)
    }

    return {
      conversation_id: conv.id,
      title: conv.title ?? '',
      provider: conv.provider,
      created_at: conv.created_at ?? 0,
      messages,
    }
  } catch (err) {
    console.error('[mcp] get_conversation error:', (err as Error).message)
    return { error: (err as Error).message }
  }
}

interface ConversationResult {
  conversation_id: string
  title: string
  provider: string
  created_at: number
  messages: { role: string; content: string; created_at: number }[]
}

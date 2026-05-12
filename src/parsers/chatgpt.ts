import AdmZip from 'adm-zip'
import { NormalizedConversation, NormalizedMessage } from '../types.js'

interface ChatGPTMessageContent {
  content_type: string
  parts: unknown[]
}

interface ChatGPTMessage {
  id: string
  author: { role: string }
  create_time: number | null
  content: ChatGPTMessageContent
}

interface ChatGPTNode {
  id: string
  message: ChatGPTMessage | null
  parent: string | null
  children: string[]
}

interface ChatGPTConversation {
  id: string
  title: string
  create_time: number
  update_time: number
  mapping: Record<string, ChatGPTNode>
  current_node: string
}

function walkToRoot(mapping: Record<string, ChatGPTNode>, currentNodeId: string): string[] {
  const path: string[] = []
  let nodeId: string | null = currentNodeId
  while (nodeId) {
    path.unshift(nodeId)
    nodeId = mapping[nodeId]?.parent ?? null
  }
  return path
}

function parseMessages(
  mapping: Record<string, ChatGPTNode>,
  currentNode: string
): NormalizedMessage[] {
  const orderedIds = walkToRoot(mapping, currentNode)
  const messages: NormalizedMessage[] = []

  for (const nodeId of orderedIds) {
    const node = mapping[nodeId]
    if (!node?.message) continue

    const { author, create_time, content } = node.message
    if (author.role !== 'user' && author.role !== 'assistant') continue
    if (create_time === null) {
      console.warn(`[chatgpt] Skipping message ${node.message.id}: null create_time`)
      continue
    }

    const parts = content.parts
    if (!Array.isArray(parts) || parts.length === 0) continue
    const textParts = parts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    if (textParts.length === 0) continue

    messages.push({
      role: author.role as 'user' | 'assistant',
      content: textParts.join(''),
      created_at: Math.floor(create_time),
    })
  }

  return messages
}

export function parseChatGPTZip(filePath: string): NormalizedConversation[] {
  const zip = new AdmZip(filePath)
  const entry = zip.getEntry('conversations.json')
  if (!entry) throw new Error('conversations.json not found in ZIP')

  const raw = JSON.parse(entry.getData().toString('utf8')) as ChatGPTConversation[]
  const results: NormalizedConversation[] = []

  for (const conv of raw) {
    try {
      if (!conv.id || !conv.mapping || !conv.current_node) continue
      const messages = parseMessages(conv.mapping, conv.current_node)
      results.push({
        provider: 'chatgpt',
        provider_conversation_id: conv.id,
        title: conv.title ?? 'Untitled',
        created_at: Math.floor(conv.create_time),
        updated_at: Math.floor(conv.update_time),
        messages,
      })
    } catch (err) {
      console.warn(`[chatgpt] Skipping conversation ${conv.id}:`, err)
    }
  }

  return results
}

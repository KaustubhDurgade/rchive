import AdmZip from 'adm-zip'
import { NormalizedConversation, NormalizedMessage } from '../types.js'

interface ClaudeChatMessage {
  uuid: string
  text: string
  sender: 'human' | 'assistant'
  created_at: string
  updated_at: string
  parent_message_uuid: string
}

interface ClaudeConversation {
  uuid: string
  name: string
  summary: string
  created_at: string
  updated_at: string
  chat_messages: ClaudeChatMessage[]
}

function parseIso(str: string): number {
  return Math.floor(Date.parse(str) / 1000)
}

function parseConversations(raw: unknown[]): Map<string, NormalizedConversation> {
  const map = new Map<string, NormalizedConversation>()
  for (const item of raw) {
    const conv = item as ClaudeConversation
    if (!conv.uuid || !conv.chat_messages) continue
    const messages: NormalizedMessage[] = []
    for (const msg of conv.chat_messages) {
      if (!msg.text || !msg.text.trim()) continue
      messages.push({
        role: msg.sender === 'human' ? 'user' : 'assistant',
        content: msg.text,
        created_at: parseIso(msg.created_at),
      })
    }
    map.set(conv.uuid, {
      provider: 'claude',
      provider_conversation_id: conv.uuid,
      title: conv.name ?? 'Untitled',
      summary: conv.summary || undefined,
      created_at: parseIso(conv.created_at),
      updated_at: parseIso(conv.updated_at),
      messages,
    })
  }
  return map
}

export function parseClaudeZip(filePath: string): NormalizedConversation[] {
  const zip = new AdmZip(filePath)
  const merged = new Map<string, NormalizedConversation>()

  // Main conversations.json
  const mainEntry = zip.getEntry('conversations.json')
  if (mainEntry) {
    try {
      const raw = JSON.parse(mainEntry.getData().toString('utf8')) as unknown[]
      for (const [uuid, conv] of parseConversations(raw)) {
        merged.set(uuid, conv)
      }
    } catch (err) {
      console.warn('[claude] Failed to parse conversations.json:', err)
    }
  }

  // All .json files inside projects/
  for (const entry of zip.getEntries()) {
    if (!entry.entryName.startsWith('projects/') || !entry.entryName.endsWith('.json')) continue
    try {
      const raw = JSON.parse(entry.getData().toString('utf8')) as unknown[]
      if (!Array.isArray(raw)) continue
      for (const [uuid, conv] of parseConversations(raw)) {
        if (!merged.has(uuid)) merged.set(uuid, conv)
      }
    } catch (err) {
      console.warn(`[claude] Failed to parse ${entry.entryName}:`, err)
    }
  }

  return Array.from(merged.values())
}

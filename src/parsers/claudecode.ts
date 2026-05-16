import fs from 'fs'
import path from 'path'
import os from 'os'
import readline from 'readline'
import { NormalizedConversation, NormalizedMessage } from '../types.js'

interface ContentBlock {
  type: string
  text?: string
}

interface SessionRecord {
  type: string
  message?: { role: string; content: string | ContentBlock[] }
  timestamp?: string
  sessionId?: string
  cwd?: string
  isSidechain?: boolean
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .filter(
      (b): b is ContentBlock =>
        !!b && typeof b === 'object' && (b as ContentBlock).type === 'text'
    )
    .map((b) => b.text ?? '')
    .join('\n')
    .trim()
}

function parseIso(str: string | undefined): number {
  if (!str) return 0
  const ms = Date.parse(str)
  return isNaN(ms) ? 0 : Math.floor(ms / 1000)
}

async function parseSessionFile(filePath: string): Promise<NormalizedConversation | null> {
  const messages: NormalizedMessage[] = []
  let sessionId = ''
  let cwd = ''
  let firstTimestamp = 0
  let lastTimestamp = 0
  let firstUserText = ''

  const stream = fs.createReadStream(filePath)
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    if (!line.trim()) continue
    let rec: SessionRecord
    try {
      rec = JSON.parse(line) as SessionRecord
    } catch {
      continue
    }
    if (rec.isSidechain) continue
    if (rec.type !== 'user' && rec.type !== 'assistant') continue
    if (!rec.message) continue

    const text = extractText(rec.message.content)
    if (!text) continue

    const ts = parseIso(rec.timestamp)
    if (!firstTimestamp || ts < firstTimestamp) firstTimestamp = ts
    if (ts > lastTimestamp) lastTimestamp = ts
    if (!sessionId && rec.sessionId) sessionId = rec.sessionId
    if (!cwd && rec.cwd) cwd = rec.cwd
    if (rec.type === 'user' && !firstUserText) firstUserText = text.slice(0, 80)

    messages.push({
      role: rec.type === 'user' ? 'user' : 'assistant',
      content: text,
      created_at: ts,
    })
  }

  if (!messages.length || !sessionId) return null

  const projectName = (cwd && path.basename(cwd)) || 'unknown'
  const titleBody = firstUserText || `Session in ${projectName}`
  const title = `[${projectName}] ${titleBody}`

  return {
    provider: 'claudecode',
    provider_conversation_id: sessionId,
    title,
    created_at: firstTimestamp,
    updated_at: lastTimestamp,
    messages,
  }
}

export async function parseClaudeCodeProjects(rootDir?: string): Promise<NormalizedConversation[]> {
  const root = rootDir ?? path.join(os.homedir(), '.claude', 'projects')
  if (!fs.existsSync(root)) return []

  const results: NormalizedConversation[] = []
  for (const projectDir of fs.readdirSync(root)) {
    const fullProjectDir = path.join(root, projectDir)
    let isDir = false
    try {
      isDir = fs.statSync(fullProjectDir).isDirectory()
    } catch {
      continue
    }
    if (!isDir) continue

    for (const file of fs.readdirSync(fullProjectDir)) {
      if (!file.endsWith('.jsonl')) continue
      const filePath = path.join(fullProjectDir, file)
      try {
        const conv = await parseSessionFile(filePath)
        if (conv) results.push(conv)
      } catch (err) {
        console.warn(`[claudecode] Failed to parse ${file}: ${(err as Error).message}`)
      }
    }
  }

  return results
}

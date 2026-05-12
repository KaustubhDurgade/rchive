import { NormalizedMessage } from '../types'

const CHUNK_CHAR_LIMIT = 2000

export function chunkConversation(messages: NormalizedMessage[]): string[] {
  const chunks: string[] = []
  let current = ''

  for (const msg of messages) {
    const line = `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`
    if (current.length + line.length > CHUNK_CHAR_LIMIT && current.length > 0) {
      chunks.push(current.trimEnd())
      current = ''
    }
    current += line
  }

  if (current.trim()) chunks.push(current.trimEnd())
  return chunks
}

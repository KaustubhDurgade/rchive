import { EnrichmentResult } from './groq.js'

const SYSTEM_PROMPT = `You are a data enrichment assistant. You will receive a chunk of an AI conversation.
Respond ONLY with a valid JSON object matching this exact structure:
{
  "topics": ["2 to 5 short topic tags"],
  "summary": "One sentence summarizing the key point of this chunk.",
  "caveman": "Rewrite as dense stripped prose. Remove all filler and pleasantries. Keep only information. Every word must carry meaning."
}`

const BASE = 'http://localhost:11434'
const EMPTY_RESULT: EnrichmentResult = { topics: [], summary: '', caveman: '' }

export async function enrichChunkOllama(
  chunk: string,
  model: string
): Promise<EnrichmentResult> {
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: chunk },
        ],
        stream: false,
        format: 'json',
      }),
    })
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
    const data = (await res.json()) as { message: { content: string } }
    return JSON.parse(data.message.content) as EnrichmentResult
  } catch (err) {
    console.warn('[ollama] enrichChunk failed:', (err as Error).message)
    return EMPTY_RESULT
  }
}

export async function summarizeConversationOllama(
  firstChunks: string[],
  model: string
): Promise<string> {
  const userContent = firstChunks.slice(0, 3).join('\n\n---\n\n')
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'Summarize the following AI conversation in one sentence. Return only the sentence, nothing else.',
          },
          { role: 'user', content: userContent },
        ],
        stream: false,
      }),
    })
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
    const data = (await res.json()) as { message: { content: string } }
    return data.message.content.trim()
  } catch (err) {
    console.warn('[ollama] summarize failed:', (err as Error).message)
    return ''
  }
}

export async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

export async function isModelPulled(model: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return false
    const data = (await res.json()) as { models: { name: string }[] }
    const base = model.includes(':') ? model : `${model}:latest`
    return data.models.some((m) => m.name === model || m.name === base)
  } catch {
    return false
  }
}

export async function pullModel(model: string): Promise<void> {
  await pullModelWithProgress(model, () => {})
}

export async function pullModelWithProgress(
  model: string,
  onProgress: (pct: number | null, status: string) => void
): Promise<void> {
  const res = await fetch(`${BASE}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model, stream: true }),
  })
  if (!res.ok) throw new Error(`Ollama pull failed: HTTP ${res.status}`)

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const ev = JSON.parse(line) as { status?: string; completed?: number; total?: number }
        const pct = ev.total && ev.completed != null
          ? Math.round((ev.completed / ev.total) * 100)
          : null
        onProgress(pct, ev.status ?? '')
      } catch { /* ignore malformed lines */ }
    }
  }
}

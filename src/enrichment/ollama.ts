import { EnrichmentResult } from './groq.js'

const SYSTEM_PROMPT = `You are a data enrichment assistant. You will receive a chunk of an AI conversation.
Respond ONLY with a valid JSON object. No preamble. No explanation. No markdown fences.
Return exactly this structure:
{
  "topics": ["2 to 5 short topic tags"],
  "summary": "One sentence summarizing the key point of this chunk.",
  "caveman": "Rewrite as dense stripped prose. Remove all filler and pleasantries. Keep only information. Every word must carry meaning."
}`

const OLLAMA_URL = 'http://localhost:11434/api/generate'
const EMPTY_RESULT: EnrichmentResult = { topics: [], summary: '', caveman: '' }

function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
}

export async function enrichChunkOllama(
  chunk: string,
  model: string
): Promise<EnrichmentResult> {
  const prompt = `${SYSTEM_PROMPT}\n\nConversation chunk:\n${chunk}`
  try {
    const res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
    })
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
    const data = (await res.json()) as { response: string }
    return JSON.parse(stripFences(data.response)) as EnrichmentResult
  } catch (err) {
    console.warn('[ollama] enrichChunk failed:', (err as Error).message)
    return EMPTY_RESULT
  }
}

export async function summarizeConversationOllama(
  firstChunks: string[],
  model: string
): Promise<string> {
  const prompt =
    'Summarize the following AI conversation in one sentence. Return only the sentence.\n\n' +
    firstChunks.slice(0, 3).join('\n\n---\n\n')
  try {
    const res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
    })
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
    const data = (await res.json()) as { response: string }
    return data.response.trim()
  } catch (err) {
    console.warn('[ollama] summarize failed:', (err as Error).message)
    return ''
  }
}

export async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

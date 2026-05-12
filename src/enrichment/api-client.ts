import { EnrichmentResult } from './groq.js'

const CHUNK_SYSTEM_PROMPT = `You are a data enrichment assistant. You will receive a chunk of an AI conversation.
Respond ONLY with a valid JSON object matching this exact structure:
{
  "topics": ["2 to 5 short topic tags"],
  "summary": "One sentence summarizing the key point of this chunk.",
  "caveman": "Rewrite as dense stripped prose. Remove all filler and pleasantries. Keep only information. Every word must carry meaning."
}`

const EMPTY_RESULT: EnrichmentResult = { topics: [], summary: '', caveman: '' }

interface ChatResponse {
  choices: { message: { content: string } }[]
}

// Module-level rate limiter — shared across all calls in this process
let _lastCallAt = 0

async function rateLimit(rpm: number): Promise<void> {
  if (rpm <= 0) return
  const minInterval = 60_000 / rpm
  const elapsed = Date.now() - _lastCallAt
  const wait = minInterval - elapsed
  if (wait > 0) await sleep(wait)
  _lastCallAt = Date.now()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function chatCompletion(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  rpm: number,
  jsonMode = false
): Promise<string> {
  await rateLimit(rpm)

  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`
  const body: Record<string, unknown> = { model, messages }
  if (jsonMode) body.response_format = { type: 'json_object' }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = (await res.json()) as ChatResponse
  return data.choices[0]?.message?.content ?? ''
}

export async function enrichChunkApi(
  chunk: string,
  apiKey: string,
  baseUrl: string,
  model: string,
  rpm: number
): Promise<EnrichmentResult> {
  const messages = [
    { role: 'system', content: CHUNK_SYSTEM_PROMPT },
    { role: 'user', content: chunk },
  ]
  try {
    let content: string
    try {
      content = await chatCompletion(baseUrl, apiKey, model, messages, rpm, true)
    } catch {
      content = await chatCompletion(baseUrl, apiKey, model, messages, rpm, false)
    }
    return JSON.parse(content) as EnrichmentResult
  } catch (err) {
    console.warn('[api-client] enrichChunk failed:', (err as Error).message)
    return EMPTY_RESULT
  }
}

export async function summarizeConversationApi(
  firstChunks: string[],
  apiKey: string,
  baseUrl: string,
  model: string,
  rpm: number
): Promise<string> {
  const userContent = firstChunks.slice(0, 3).join('\n\n---\n\n')
  try {
    return await chatCompletion(baseUrl, apiKey, model, [
      { role: 'system', content: 'Summarize the following AI conversation in one sentence. Return only the sentence, nothing else.' },
      { role: 'user', content: userContent },
    ], rpm)
  } catch (err) {
    console.warn('[api-client] summarize failed:', (err as Error).message)
    return ''
  }
}

export async function validateApiKey(
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Bypass rate limiter for validation
    await chatCompletion(baseUrl, apiKey, model, [{ role: 'user', content: 'hi' }], 0)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

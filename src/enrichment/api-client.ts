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

async function chatCompletion(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  jsonMode = false
): Promise<string> {
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
  model: string
): Promise<EnrichmentResult> {
  const messages = [
    { role: 'system', content: CHUNK_SYSTEM_PROMPT },
    { role: 'user', content: chunk },
  ]
  try {
    // Try with json_mode first; fall back without it for providers that don't support it
    let content: string
    try {
      content = await chatCompletion(baseUrl, apiKey, model, messages, true)
    } catch {
      content = await chatCompletion(baseUrl, apiKey, model, messages, false)
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
  model: string
): Promise<string> {
  const userContent = firstChunks.slice(0, 3).join('\n\n---\n\n')
  try {
    return await chatCompletion(baseUrl, apiKey, model, [
      { role: 'system', content: 'Summarize the following AI conversation in one sentence. Return only the sentence, nothing else.' },
      { role: 'user', content: userContent },
    ])
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
    await chatCompletion(baseUrl, apiKey, model, [
      { role: 'user', content: 'hi' },
    ])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

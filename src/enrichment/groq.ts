import Groq from 'groq-sdk'

export interface EnrichmentResult {
  topics: string[]
  summary: string
  caveman: string
}

const SYSTEM_PROMPT = `You are a data enrichment assistant. You will receive a chunk of an AI conversation.
Respond ONLY with a valid JSON object. No preamble. No explanation. No markdown fences.
Return exactly this structure:
{
  "topics": ["2 to 5 short topic tags"],
  "summary": "One sentence summarizing the key point of this chunk.",
  "caveman": "Rewrite as dense stripped prose. Remove all filler and pleasantries. Keep only information. Every word must carry meaning."
}`

const EMPTY_RESULT: EnrichmentResult = { topics: [], summary: '', caveman: '' }

function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
}

export async function enrichChunk(
  chunk: string,
  apiKey: string
): Promise<EnrichmentResult> {
  const client = new Groq({ apiKey })
  let delay = 1000
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: chunk },
        ],
        temperature: 0,
      })
      const raw = stripFences(response.choices[0]?.message?.content ?? '')
      return JSON.parse(raw) as EnrichmentResult
    } catch (err: unknown) {
      const isRateLimit =
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        (err as { status: number }).status === 429

      if (isRateLimit && attempt < 4) {
        await sleep(delay)
        delay *= 2
        continue
      }
      console.warn('[groq] enrichChunk failed:', (err as Error).message)
      return EMPTY_RESULT
    }
  }
  return EMPTY_RESULT
}

export async function summarizeConversation(
  firstChunks: string[],
  apiKey: string
): Promise<string> {
  const client = new Groq({ apiKey })
  const prompt = firstChunks.slice(0, 3).join('\n\n---\n\n')
  try {
    const response = await client.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content:
            'Summarize the following AI conversation in one sentence. Return only the sentence, nothing else.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
    })
    return response.choices[0]?.message?.content?.trim() ?? ''
  } catch (err) {
    console.warn('[groq] summarizeConversation failed:', (err as Error).message)
    return ''
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

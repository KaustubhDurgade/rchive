import Database from 'better-sqlite3'
import { ftsSearch, ChunkResult } from './fts'
import { vectorSearch } from './vector'

export interface SearchResult {
  chunk_id: string
  conversation_id: string
  conversation_title: string
  provider: string
  created_at: number
  content: string
  topics: string[]
  relevance_score: number
}

const cache = new Map<string, SearchResult[]>()
const MAX_CACHE = 20
const cacheOrder: string[] = []

function cacheGet(key: string): SearchResult[] | undefined {
  return cache.get(key)
}

function cacheSet(key: string, value: SearchResult[]): void {
  if (cacheOrder.length >= MAX_CACHE) {
    const oldest = cacheOrder.shift()!
    cache.delete(oldest)
  }
  cacheOrder.push(key)
  cache.set(key, value)
}

function normalize(scores: number[]): number[] {
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  if (max === min) return scores.map(() => 1)
  return scores.map((s) => (s - min) / (max - min))
}

export async function hybridSearch(
  db: Database.Database,
  query: string,
  limit: number,
  compression: string
): Promise<SearchResult[]> {
  const cacheKey = `${query}::${compression}::${limit}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const [ftsResults, vecResults] = await Promise.all([
    Promise.resolve(ftsSearch(db, query, limit * 2)),
    vectorSearch(db, query, limit * 2),
  ])

  const chunkMap = new Map<string, { ftsScore: number; vecScore: number; chunk: ChunkResult }>()

  for (const r of ftsResults) {
    chunkMap.set(r.id, { ftsScore: r.score, vecScore: 0, chunk: r })
  }
  for (const r of vecResults) {
    const existing = chunkMap.get(r.id)
    if (existing) {
      existing.vecScore = r.score
    } else {
      chunkMap.set(r.id, { ftsScore: 0, vecScore: r.score, chunk: r })
    }
  }

  const entries = Array.from(chunkMap.values())
  const ftsScores = entries.map((e) => e.ftsScore)
  const vecScores = entries.map((e) => e.vecScore)

  // FTS5 ranks are negative — negate them so higher = better before normalizing
  const normalizedFts = normalize(ftsScores.map((s) => -s))
  const normalizedVec = normalize(vecScores)

  const scored = entries.map((entry, i) => ({
    chunk: entry.chunk,
    score: normalizedFts[i] * 0.4 + normalizedVec[i] * 0.6,
  }))
  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, limit)

  if (top.length === 0) {
    cacheSet(cacheKey, [])
    return []
  }

  const convIds = [...new Set(top.map((t) => t.chunk.conversation_id))]
  const convRows = db.prepare(
    `SELECT id, title, provider, created_at FROM conversations WHERE id IN (${convIds.map(() => '?').join(',')})`
  ).all(...convIds) as { id: string; title: string; provider: string; created_at: number }[]
  const convMap = new Map(convRows.map((r) => [r.id, r]))

  const results: SearchResult[] = top.map(({ chunk, score }) => {
    const conv = convMap.get(chunk.conversation_id)
    const topics = (() => {
      try { return JSON.parse(chunk.topics) as string[] } catch { return [] }
    })()
    return {
      chunk_id: chunk.id,
      conversation_id: chunk.conversation_id,
      conversation_title: conv?.title ?? 'Unknown',
      provider: conv?.provider ?? 'unknown',
      created_at: conv?.created_at ?? 0,
      content: chunk.content,
      topics,
      relevance_score: score,
    }
  })

  cacheSet(cacheKey, results)
  return results
}

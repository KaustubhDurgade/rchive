import Database from 'better-sqlite3'
import { ftsSearch, ChunkResult, sanitizeFtsQuery } from './fts.js'
import { vectorSearch } from './vector.js'

export interface SearchResult {
  chunk_id: string
  conversation_id: string
  conversation_title: string
  provider: string
  created_at: number
  content: string
  topics: string[]
  relevance_score: number
  match_count?: number
  is_title_match?: boolean
}

export interface HybridSearchOptions {
  groupByConversation?: boolean
}

const cache = new Map<string, SearchResult[]>()
const MAX_CACHE = 20
const cacheOrder: string[] = []

const RRF_K = 60
const FETCH_MULTIPLIER = 3

function cacheKey(query: string, limit: number, compression: string, group: boolean): string {
  return `${query}::${compression}::${limit}::${group ? 'g' : 'c'}`
}

function cacheGet(key: string): SearchResult[] | undefined {
  return cache.get(key)
}

function cacheSet(key: string, value: SearchResult[]): void {
  if (cacheOrder.length >= MAX_CACHE) {
    const oldest = cacheOrder.shift()
    if (oldest) cache.delete(oldest)
  }
  cacheOrder.push(key)
  cache.set(key, value)
}

interface ConversationRow {
  id: string
  title: string
  provider: string
  created_at: number
  summary: string | null
}

function fetchConversationsByIds(
  db: Database.Database,
  ids: string[]
): Map<string, ConversationRow> {
  if (ids.length === 0) return new Map()
  const placeholders = ids.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT id, title, provider, created_at, summary FROM conversations WHERE id IN (${placeholders})`
    )
    .all(...ids) as ConversationRow[]
  return new Map(rows.map((r) => [r.id, r]))
}

function parseTopics(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

interface RankedChunk {
  chunk: ChunkResult
  rrfScore: number
  ftsRank: number | null
  vecRank: number | null
}

function fuseRanks(ftsResults: ChunkResult[], vecResults: ChunkResult[]): RankedChunk[] {
  const merged = new Map<string, RankedChunk>()

  ftsResults.forEach((chunk, idx) => {
    merged.set(chunk.id, {
      chunk,
      rrfScore: 1 / (RRF_K + idx + 1),
      ftsRank: idx + 1,
      vecRank: null,
    })
  })

  vecResults.forEach((chunk, idx) => {
    const existing = merged.get(chunk.id)
    const vecContrib = 1 / (RRF_K + idx + 1)
    if (existing) {
      existing.rrfScore += vecContrib
      existing.vecRank = idx + 1
    } else {
      merged.set(chunk.id, {
        chunk,
        rrfScore: vecContrib,
        ftsRank: null,
        vecRank: idx + 1,
      })
    }
  })

  return [...merged.values()].sort((a, b) => b.rrfScore - a.rrfScore)
}

function buildChunkResults(
  ranked: RankedChunk[],
  convMap: Map<string, ConversationRow>
): SearchResult[] {
  return ranked.map(({ chunk, rrfScore }) => {
    const conv = convMap.get(chunk.conversation_id)
    return {
      chunk_id: chunk.id,
      conversation_id: chunk.conversation_id,
      conversation_title: conv?.title ?? 'Unknown',
      provider: conv?.provider ?? 'unknown',
      created_at: conv?.created_at ?? 0,
      content: chunk.content,
      topics: parseTopics(chunk.topics),
      relevance_score: rrfScore,
    }
  })
}

function groupResultsByConversation(results: SearchResult[]): SearchResult[] {
  const grouped = new Map<string, SearchResult>()
  for (const result of results) {
    const existing = grouped.get(result.conversation_id)
    if (!existing) {
      grouped.set(result.conversation_id, { ...result, match_count: 1 })
      continue
    }
    existing.match_count = (existing.match_count ?? 1) + 1
    // Keep the highest-scored chunk as the representative
    if (result.relevance_score > existing.relevance_score) {
      existing.chunk_id = result.chunk_id
      existing.content = result.content
      existing.topics = result.topics
      existing.relevance_score = result.relevance_score
    }
  }
  return [...grouped.values()].sort((a, b) => b.relevance_score - a.relevance_score)
}

interface TitleMatchRow {
  id: string
  title: string
  provider: string
  created_at: number
  summary: string | null
  updated_at: number | null
  enriched: number
}

function titleFallback(
  db: Database.Database,
  query: string,
  limit: number,
  excludeIds: Set<string>
): SearchResult[] {
  const tokens = query
    .replace(/[^\p{L}\p{N}_\s]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
  if (tokens.length === 0) return []

  const likeClauses = tokens.map(() => '(title LIKE ? OR summary LIKE ?)').join(' OR ')
  const likeArgs = tokens.flatMap((t) => [`%${t}%`, `%${t}%`])
  const rows = db
    .prepare(
      `SELECT id, title, provider, created_at, summary, updated_at, enriched
       FROM conversations
       WHERE ${likeClauses}
       ORDER BY enriched ASC, updated_at DESC
       LIMIT ?`
    )
    .all(...likeArgs, limit * 2) as TitleMatchRow[]

  return rows
    .filter((row) => !excludeIds.has(row.id))
    .slice(0, limit)
    .map((row) => ({
      chunk_id: `title:${row.id}`,
      conversation_id: row.id,
      conversation_title: row.title ?? 'Unknown',
      provider: row.provider,
      created_at: row.created_at ?? 0,
      content: row.summary ?? `(title match — conversation not yet enriched)`,
      topics: [],
      relevance_score: 0,
      is_title_match: true,
    }))
}

export async function hybridSearch(
  db: Database.Database,
  query: string,
  limit: number,
  compression: string,
  options: HybridSearchOptions = {}
): Promise<SearchResult[]> {
  const groupByConversation = options.groupByConversation ?? true
  const key = cacheKey(query, limit, compression, groupByConversation)
  const cached = cacheGet(key)
  if (cached) return cached

  const fetchLimit = limit * FETCH_MULTIPLIER
  const [ftsResults, vecResults] = await Promise.all([
    Promise.resolve(ftsSearch(db, query, fetchLimit)),
    vectorSearch(db, query, fetchLimit).catch((err) => {
      console.warn('[vector] search failed:', (err as Error).message)
      return [] as ChunkResult[]
    }),
  ])

  const ranked = fuseRanks(ftsResults, vecResults)
  const convIds = [...new Set(ranked.map((r) => r.chunk.conversation_id))]
  const convMap = fetchConversationsByIds(db, convIds)
  const chunkResults = buildChunkResults(ranked, convMap)

  let primary = groupByConversation
    ? groupResultsByConversation(chunkResults)
    : chunkResults
  primary = primary.slice(0, limit)

  if (primary.length < limit) {
    const excludeIds = new Set(primary.map((r) => r.conversation_id))
    const fallback = titleFallback(db, query, limit - primary.length, excludeIds)
    primary = primary.concat(fallback)
  }

  cacheSet(key, primary)
  return primary
}

export function clearSearchCache(): void {
  cache.clear()
  cacheOrder.length = 0
}

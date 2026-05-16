import Database from 'better-sqlite3'

export interface ChunkResult {
  id: string
  conversation_id: string
  content: string
  topics: string
  compression_summary: string
  caveman_content: string
  score: number
}

// FTS5 reserves: " ( ) [ ] : - + * ^ . , and double-quotes for phrases.
// We strip everything except letters, numbers, spaces, and a few useful joiners,
// then OR the surviving tokens together. Empty tokens are dropped.
const FTS_TOKEN_REGEX = /[^\p{L}\p{N}_\s]/gu
const MIN_TOKEN_LEN = 2

export function sanitizeFtsQuery(query: string): string {
  const cleaned = query.replace(FTS_TOKEN_REGEX, ' ')
  const tokens = cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= MIN_TOKEN_LEN)
  if (tokens.length === 0) return ''
  // Prefix-match each token so "decide" matches "decided", "decider", etc.
  // Tokens are already alphanumeric-only, so they're safe as bare FTS5 tokens.
  return tokens.map((t) => `${t}*`).join(' OR ')
}

export function ftsSearch(
  db: Database.Database,
  query: string,
  limit: number
): ChunkResult[] {
  const matchQuery = sanitizeFtsQuery(query)
  if (!matchQuery) return []

  try {
    const rows = db.prepare(`
      SELECT chunks.id, chunks.conversation_id, chunks.content,
             chunks.topics, chunks.compression_summary, chunks.caveman_content,
             chunks_fts.rank as fts_rank
      FROM chunks_fts
      JOIN chunks ON chunks.rowid = chunks_fts.rowid
      WHERE chunks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(matchQuery, limit) as (Omit<ChunkResult, 'score'> & { fts_rank: number })[]

    return rows.map((r) => ({
      ...r,
      score: r.fts_rank,
    }))
  } catch (err) {
    console.warn('[fts] query failed, returning no results:', (err as Error).message)
    return []
  }
}

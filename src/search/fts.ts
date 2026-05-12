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

export function ftsSearch(
  db: Database.Database,
  query: string,
  limit: number
): ChunkResult[] {
  const rows = db.prepare(`
    SELECT chunks.id, chunks.conversation_id, chunks.content,
           chunks.topics, chunks.compression_summary, chunks.caveman_content,
           chunks_fts.rank as fts_rank
    FROM chunks_fts
    JOIN chunks ON chunks.rowid = chunks_fts.rowid
    WHERE chunks_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(query, limit) as (Omit<ChunkResult, 'score'> & { fts_rank: number })[]

  return rows.map((r) => ({
    ...r,
    score: r.fts_rank,
  }))
}

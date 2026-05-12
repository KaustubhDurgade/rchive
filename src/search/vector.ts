import Database from 'better-sqlite3'
import { embed } from '../enrichment/embeddings'
import { ChunkResult } from './fts'

export async function vectorSearch(
  db: Database.Database,
  query: string,
  limit: number
): Promise<ChunkResult[]> {
  const queryEmbedding = await embed(query)
  const queryBuf = Buffer.from(queryEmbedding.buffer)

  // sqlite-vec uses vec_distance_cosine; lower = more similar
  const rows = db.prepare(`
    SELECT c.id, c.conversation_id, c.content, c.topics, c.compression_summary, c.caveman_content,
           vec_distance_cosine(c.embedding, ?) as distance
    FROM chunks c
    WHERE c.embedding IS NOT NULL
    ORDER BY distance ASC
    LIMIT ?
  `).all(queryBuf, limit) as (Omit<ChunkResult, 'score'> & { distance: number })[]

  return rows.map((r) => ({
    ...r,
    // convert distance (0=identical, 2=opposite) to similarity score (0-1)
    score: 1 - r.distance / 2,
  }))
}

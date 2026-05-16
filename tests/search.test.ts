import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { sanitizeFtsQuery, ftsSearch } from '../src/search/fts.js'

function makeFtsDb(): Database.Database {
  const db = new Database(':memory:')
  sqliteVec.load(db)
  db.exec(`
    CREATE TABLE chunks (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      content TEXT,
      embedding BLOB,
      topics TEXT,
      compression_summary TEXT,
      caveman_content TEXT
    );
    CREATE VIRTUAL TABLE chunks_fts USING fts5(
      content,
      content='chunks',
      content_rowid='rowid'
    );
    CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, content) VALUES (new.rowid, new.content);
    END;
  `)
  return db
}

describe('sanitizeFtsQuery', () => {
  test('strips punctuation that would crash FTS5', () => {
    expect(sanitizeFtsQuery('what did i decide about auth?')).toContain('decide*')
    expect(sanitizeFtsQuery('what did i decide about auth?')).not.toContain('?')
  })

  test('drops single-character tokens', () => {
    expect(sanitizeFtsQuery('a b cd ef')).toBe('cd* OR ef*')
  })

  test('returns empty string for query with only punctuation', () => {
    expect(sanitizeFtsQuery('?!')).toBe('')
  })

  test('joins tokens with OR and adds prefix wildcards', () => {
    expect(sanitizeFtsQuery('hello world')).toBe('hello* OR world*')
  })

  test('handles unicode word characters', () => {
    const result = sanitizeFtsQuery('café résumé')
    expect(result).toContain('café*')
    expect(result).toContain('résumé*')
  })

  test('handles SQL-injection-like input without throwing', () => {
    expect(() => sanitizeFtsQuery(`"; DROP TABLE chunks; --`)).not.toThrow()
  })
})

describe('ftsSearch', () => {
  test('does not crash on raw natural-language query with punctuation', () => {
    const db = makeFtsDb()
    db.prepare(`INSERT INTO chunks (id, conversation_id, content, topics) VALUES (?, ?, ?, ?)`).run(
      'c1',
      'conv1',
      'we decided to ship the authentication migration on Tuesday',
      '[]'
    )
    expect(() => ftsSearch(db, 'what did I decide about auth?', 5)).not.toThrow()
    const results = ftsSearch(db, 'what did I decide about auth?', 5)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].content).toContain('decided')
  })

  test('returns empty array when query has no usable tokens', () => {
    const db = makeFtsDb()
    expect(ftsSearch(db, '???', 5)).toEqual([])
  })
})

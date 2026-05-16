import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { getDb } from '../../db/schema.js'
import { hybridSearch, SearchResult } from '../../search/hybrid.js'
import { getConfig } from '../../config.js'

type Mode = 'input' | 'results'

export function QueryScreen(): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('input')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const config = getConfig()

  useInput((input, key) => {
    if (mode !== 'results') return
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (key.upArrow) {
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (key.return && results.length > 0) {
      const id = results[selectedIndex]?.chunk_id
      setExpanded((prev) => (prev === id ? null : id ?? null))
    } else if (key.escape || input === '/') {
      setMode('input')
    }
  })

  const runSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setError(null)
    try {
      const db = getDb()
      const found = await hybridSearch(db, query, 10, config.defaultCompression, {
        groupByConversation: true,
      })
      setResults(found)
      setSelectedIndex(0)
      setExpanded(null)
      setMode('results')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSearching(false)
    }
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold>Search Archive</Text>

      <Box marginTop={1} flexDirection="row">
        <Text color="cyan">❯ </Text>
        {mode === 'input' ? (
          <TextInput
            value={query}
            onChange={setQuery}
            onSubmit={runSearch}
            placeholder="Type query and press Enter..."
            focus={true}
          />
        ) : (
          <Text>{query}</Text>
        )}
      </Box>

      {searching && <Text color="yellow">Searching...</Text>}
      {error && <Text color="red">Error: {error}</Text>}

      {!searching && mode === 'results' && results.length === 0 && (
        <Text dimColor>No results found.</Text>
      )}

      {results.map((r, i) => {
        const isSelected = i === selectedIndex
        const isExpanded = expanded === r.chunk_id
        return (
          <Box key={r.chunk_id} flexDirection="column" marginTop={1}>
            <Box flexDirection="row">
              <Text color={isSelected ? 'cyan' : 'gray'}>{isSelected ? '▶ ' : '  '}</Text>
              <Box flexDirection="column">
                <Box flexDirection="row">
                  <Text bold color={isSelected ? 'white' : undefined}>{r.conversation_title}</Text>
                  <Text dimColor> [{r.provider}]</Text>
                  <Text dimColor> · {new Date(r.created_at * 1000).toLocaleDateString()}</Text>
                  {r.match_count && r.match_count > 1 && (
                    <Text dimColor> · {r.match_count} matches</Text>
                  )}
                  {r.is_title_match && (
                    <Text color="yellow"> · title match (un-enriched)</Text>
                  )}
                </Box>
                <Text dimColor>{r.content.slice(0, 200)}{r.content.length > 200 ? '…' : ''}</Text>
                {isExpanded && (
                  <Box marginTop={1} borderStyle="single" paddingX={1} flexDirection="column">
                    <Text>{r.content}</Text>
                    {r.topics.length > 0 && (
                      <Text dimColor>Topics: {r.topics.join(', ')}</Text>
                    )}
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        )
      })}

      <Box marginTop={1}>
        {mode === 'results' && (
          <Text dimColor>↑↓ navigate  ·  Enter expand  ·  Esc or / to edit query</Text>
        )}
      </Box>
    </Box>
  )
}

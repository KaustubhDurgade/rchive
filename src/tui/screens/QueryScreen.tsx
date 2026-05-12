import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { getDb } from '../../db/schema'
import { hybridSearch, SearchResult } from '../../search/hybrid'
import { getConfig } from '../../config'

export function QueryScreen(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const config = getConfig()

  useInput((_input, key) => {
    if (key.downArrow) setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
    if (key.upArrow) setSelectedIndex((i) => Math.max(i - 1, 0))
    if (key.return && results.length > 0) {
      const id = results[selectedIndex]?.chunk_id
      setExpanded(expanded === id ? null : id ?? null)
    }
  })

  const runSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setError(null)
    try {
      const db = getDb()
      const found = await hybridSearch(db, query, 10, config.defaultCompression)
      setResults(found)
      setSelectedIndex(0)
      setExpanded(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSearching(false)
    }
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold>Query Archive</Text>

      <Box marginTop={1} flexDirection="row">
        <Text>Search: </Text>
        <TextInput
          value={query}
          onChange={setQuery}
          onSubmit={runSearch}
          placeholder="Type query and press Enter..."
        />
      </Box>

      {searching && <Text color="yellow">Searching...</Text>}
      {error && <Text color="red">Error: {error}</Text>}

      {!searching && results.length === 0 && query && (
        <Text dimColor>No results found.</Text>
      )}

      {results.map((r, i) => {
        const isSelected = i === selectedIndex
        const isExpanded = expanded === r.chunk_id
        return (
          <Box key={r.chunk_id} flexDirection="column" marginTop={1}>
            <Box flexDirection="row">
              <Text color={isSelected ? 'cyan' : undefined}>{isSelected ? '▶ ' : '  '}</Text>
              <Box flexDirection="column">
                <Box flexDirection="row">
                  <Text bold color="white">{r.conversation_title}</Text>
                  <Text dimColor> [{r.provider}]</Text>
                  <Text dimColor> · {new Date(r.created_at * 1000).toLocaleDateString()}</Text>
                </Box>
                <Text dimColor>{r.content.slice(0, 200)}{r.content.length > 200 ? '...' : ''}</Text>
                {isExpanded && (
                  <Box marginTop={1} flexDirection="column">
                    <Text>{r.content}</Text>
                    {r.topics.length > 0 && <Text dimColor>Topics: {r.topics.join(', ')}</Text>}
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        )
      })}

      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter to expand · Tab to switch screens</Text>
      </Box>
    </Box>
  )
}

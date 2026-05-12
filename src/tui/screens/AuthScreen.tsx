import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import { getDb } from '../../db/schema.js'
import { getProviderStats } from '../../db/queries.js'

const KNOWN_PROVIDERS = ['chatgpt', 'claude'] as const

function formatDate(ts: number | null | undefined): string {
  if (!ts) return 'never'
  return new Date(ts * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatRelativeTime(ts: number | null | undefined): string {
  if (!ts) return 'never'
  const diffSec = Math.floor(Date.now() / 1000) - ts
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

export function AuthScreen(): React.JSX.Element {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 3000)
    return () => clearInterval(id)
  }, [])

  void tick

  const db = getDb()
  const stats = getProviderStats(db)
  const statsByProvider = Object.fromEntries(stats.map((s) => [s.provider, s]))

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold>Providers</Text>

      <Box marginTop={1} flexDirection="column">
        {KNOWN_PROVIDERS.map((provider) => {
          const s = statsByProvider[provider]
          const hasData = !!s && s.total > 0

          return (
            <Box key={provider} flexDirection="column" marginBottom={1}>
              <Box flexDirection="row">
                <Text color={hasData ? 'green' : 'gray'}>● </Text>
                <Text bold>{provider.toUpperCase()}</Text>
                {hasData && (
                  <Text dimColor>
                    {'  '}{s.total.toLocaleString()} conversations
                  </Text>
                )}
              </Box>

              {hasData ? (
                <Box flexDirection="column" marginLeft={2}>
                  <Text dimColor>
                    Latest conversation:{'  '}
                    <Text color="white">{formatDate(s.latest_conversation_at)}</Text>
                  </Text>
                  <Text dimColor>
                    Last import:{'  '}
                    <Text color="white">{formatRelativeTime(s.last_imported_at)}</Text>
                  </Text>
                  {s.pending > 0 && (
                    <Text color="yellow">{s.pending} pending enrichment</Text>
                  )}
                </Box>
              ) : (
                <Box marginLeft={2}>
                  <Text dimColor>Run: rchive import {'<file.zip>'}</Text>
                </Box>
              )}
            </Box>
          )
        })}

        <Box flexDirection="column" marginBottom={1}>
          <Box flexDirection="row">
            <Text color="gray">● </Text>
            <Text bold>GEMINI</Text>
          </Box>
          <Box marginLeft={2}><Text dimColor>No public API — not yet supported</Text></Box>
        </Box>
      </Box>
    </Box>
  )
}

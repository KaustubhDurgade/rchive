import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import fs from 'fs'
import { getDb, getDbPath } from '../../db/schema.js'
import { getProviderStats, getTotalStats } from '../../db/queries.js'
import { getConfig } from '../../config.js'

function getDbSizeMb(): string {
  try {
    const stat = fs.statSync(getDbPath())
    return (stat.size / 1024 / 1024).toFixed(1) + ' MB'
  } catch {
    return 'unknown'
  }
}

function formatRelativeTime(unixTs: number | null): string {
  if (!unixTs) return 'never'
  const diffSec = Math.floor(Date.now() / 1000) - unixTs
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

function progressBar(done: number, total: number, width = 20): string {
  if (total === 0) return ''
  const filled = Math.round((done / total) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export function StatusScreen(): React.JSX.Element {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000)
    return () => clearInterval(id)
  }, [])

  // tick dependency forces re-read on each interval
  void tick

  const db = getDb()
  const config = getConfig()
  const providerStats = getProviderStats(db)
  const totals = getTotalStats(db)

  const totalConvs = providerStats.reduce((s, r) => s + r.total, 0)
  const totalPending = providerStats.reduce((s, r) => s + r.pending, 0)
  const enriched = totalConvs - totalPending
  const enrichPct = totalConvs > 0 ? Math.round((enriched / totalConvs) * 100) : 100
  const isEnriching = totalPending > 0

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold>Status</Text>

      <Box marginTop={1} flexDirection="column">
        {providerStats.length === 0 && (
          <Text dimColor>No conversations imported yet.</Text>
        )}
        {providerStats.map((row) => (
          <Box key={row.provider} flexDirection="row" marginBottom={0}>
            <Box width={12}><Text bold>{row.provider}</Text></Box>
            <Box width={8}><Text>{String(row.total)}</Text></Box>
            <Box width={14}><Text dimColor>{formatRelativeTime(row.last_imported_at)}</Text></Box>
            <Text color={row.pending === 0 ? 'green' : 'yellow'}>
              {row.pending === 0 ? '✓ enriched' : `${row.pending} pending`}
            </Text>
          </Box>
        ))}
      </Box>

      {totalConvs > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Box flexDirection="row">
            <Text color={isEnriching ? 'yellow' : 'green'}>
              {progressBar(enriched, totalConvs)}
            </Text>
            <Text> {enrichPct}%</Text>
            {isEnriching && <Text color="yellow">  enriching…</Text>}
          </Box>
          <Text dimColor>{enriched.toLocaleString()} / {totalConvs.toLocaleString()} enriched</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text>{totals.conversations.toLocaleString()} conversations · {totals.chunks.toLocaleString()} chunks · {getDbSizeMb()}</Text>
        <Text>Model: <Text color="cyan">{config.ollamaModel ?? 'not configured'}</Text></Text>
        <Text dimColor>MCP: localhost:{config.mcpPort}</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Auto-refreshes every 2s  |  Tab to switch screens</Text>
      </Box>
    </Box>
  )
}

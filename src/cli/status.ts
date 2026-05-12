import Table from 'cli-table3'
import chalk from 'chalk'
import fs from 'fs'
import { getDb, getDbPath } from '../db/schema'
import { getProviderStats, getTotalStats } from '../db/queries'
import { getConfig } from '../config'

function formatRelativeTime(unixTs: number | null): string {
  if (!unixTs) return 'never'
  const diffSec = Math.floor(Date.now() / 1000) - unixTs
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`
  return `${Math.floor(diffSec / 86400)} days ago`
}

function getDbSizeMb(): string {
  try {
    const stat = fs.statSync(getDbPath())
    return (stat.size / 1024 / 1024).toFixed(0) + 'MB'
  } catch {
    return 'unknown'
  }
}

export async function printStatus(): Promise<void> {
  const db = getDb()
  const config = getConfig()
  const providerStats = getProviderStats(db)
  const totals = getTotalStats(db)

  console.log(chalk.gray('─'.repeat(69)))

  const table = new Table({
    head: [
      chalk.bold('Provider'),
      chalk.bold('Conversations'),
      chalk.bold('Last Import'),
      chalk.bold('Enriched'),
    ],
    style: { head: [], border: [] },
  })

  for (const row of providerStats) {
    const enrichedCount = (row.total as number) - (row.pending as number)
    const enrichedCell =
      row.pending === 0
        ? chalk.green('✓')
        : row.pending === row.total
        ? chalk.yellow('pending')
        : chalk.yellow(`✓ (${row.pending} pending)`)

    table.push([
      row.provider,
      String(row.total),
      formatRelativeTime(row.last_imported_at),
      enrichedCell,
    ])
  }

  console.log(table.toString())

  console.log(
    chalk.gray('─'.repeat(69))
  )
  console.log(
    `Total: ${chalk.bold(totals.conversations.toLocaleString())} conversations  |  ` +
      `${chalk.bold(totals.chunks.toLocaleString())} chunks  |  DB: ${chalk.bold(getDbSizeMb())}`
  )

  const enrichmentLabel =
    config.enrichmentProvider === 'ollama' && config.ollamaModel
      ? `ollama (${config.ollamaModel})`
      : config.enrichmentProvider ?? chalk.yellow('not configured')

  console.log(`Enrichment: ${chalk.cyan(enrichmentLabel)}`)
  console.log(
    `MCP server: ${chalk.gray(`run 'rchive serve' to start on localhost:${config.mcpPort}`)}`
  )
  console.log(chalk.gray('─'.repeat(69)))
}

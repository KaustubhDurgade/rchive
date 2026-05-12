#!/usr/bin/env node
import { Command } from 'commander'
import path from 'path'
import fs from 'fs'
import readline from 'readline'
import chalk from 'chalk'
import AdmZip from 'adm-zip'
import { getDb } from './db/schema.js'
import { diffAndImport } from './db/diff.js'
import { parseChatGPTZip } from './parsers/chatgpt.js'
import { parseClaudeZip } from './parsers/claude.js'
import { NormalizedConversation } from './types.js'

const program = new Command()
program.name('rchive').description('Local-first AI conversation archive').version('1.0.0')

// --- import ---
program
  .command('import <file>')
  .description('Import a chat export ZIP or JSON file')
  .action(async (file: string) => {
    const filePath = path.resolve(file)
    if (!fs.existsSync(filePath)) {
      console.error(chalk.red(`File not found: ${filePath}`))
      process.exit(1)
    }

    let conversations: NormalizedConversation[]
    try {
      conversations = detectAndParse(filePath)
    } catch (err) {
      console.error(chalk.red(`Parse error: ${(err as Error).message}`))
      process.exit(1)
    }

    const db = getDb()
    const stats = diffAndImport(db, conversations)

    console.log(
      chalk.green('✓') +
        ` Import complete: ${chalk.bold(stats.newCount)} new  |  ${chalk.bold(stats.updatedCount)} updated  |  ${chalk.bold(stats.skippedCount)} skipped`
    )

    const deleteFile = await prompt('Delete source file? [y/n]: ')
    if (deleteFile.trim().toLowerCase() === 'y') {
      fs.unlinkSync(filePath)
      console.log(chalk.gray('Source file deleted.'))
    }

    // Kick off enrichment non-blocking
    setImmediate(async () => {
      const { runEnrichmentPipeline } = await import('./enrichment/pipeline.js')
      runEnrichmentPipeline(false).catch((err: Error) =>
        console.error('[enrichment] Pipeline error:', err.message)
      )
    })
  })

// --- enrich ---
program
  .command('enrich')
  .description('Manually trigger enrichment pass')
  .action(async () => {
    const { runEnrichmentPipeline } = await import('./enrichment/pipeline.js')
    await runEnrichmentPipeline(true)
  })

// --- serve ---
program
  .command('serve')
  .description('Start MCP server')
  .option('-p, --port <n>', 'Port number')
  .action(async (opts: { port?: string }) => {
    const { startMcpServer } = await import('./mcp/server.js')
    const port = opts.port ? parseInt(opts.port, 10) : undefined
    await startMcpServer(port)
  })

// --- status ---
program
  .command('status')
  .description('Print DB stats')
  .action(async () => {
    const { printStatus } = await import('./cli/status.js')
    await printStatus()
  })

// --- sync ---
program
  .command('sync')
  .description('Pull new conversations from API providers')
  .action(() => {
    console.log(chalk.yellow('No API providers are configured for sync yet.'))
    console.log('Use ' + chalk.bold('rchive import <file>') + ' to import exports from ChatGPT or Claude.')
  })

// --- ui ---
program
  .command('ui')
  .description('Launch TUI')
  .action(async () => {
    const { launchTui } = await import('./tui/launch.js')
    await launchTui()
  })

// Default action: launch TUI
program.action(async () => {
  const { launchTui } = await import('./tui/launch.js')
  await launchTui()
})

program.parse(process.argv)

function detectAndParse(filePath: string): NormalizedConversation[] {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.zip') {
    // Try Claude first (has chat_messages field), then ChatGPT
    try {
      const zip = new AdmZip(filePath)
      const mainEntry = zip.getEntry('conversations.json')
      if (mainEntry) {
        const raw = JSON.parse(mainEntry.getData().toString('utf8'))
        if (Array.isArray(raw) && raw.length > 0 && raw[0].chat_messages !== undefined) {
          return parseClaudeZip(filePath)
        }
      }
    } catch {
      // fall through to ChatGPT
    }
    return parseChatGPTZip(filePath)
  }
  throw new Error(`Unsupported file type: ${ext}. Provide a .zip export from ChatGPT or Claude.`)
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans) }))
}

import os from 'os'
import { execSync, spawn } from 'child_process'
import readline from 'readline'
import chalk from 'chalk'
import ora from 'ora'
import { getConfig, saveConfig, saveGroqKey } from '../config.js'
import { isOllamaRunning, pullModelWithProgress } from './ollama.js'
import { defaultModelForRam } from './models.js'

const RAM_MIN_GB = 4

let _rl: readline.Interface | null = null
function getRL(): readline.Interface {
  if (!_rl) _rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return _rl
}
export function closeSetupRL(): void { _rl?.close(); _rl = null }

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => getRL().question(question, resolve))
}

function getRamGb(): number {
  return os.totalmem() / 1024 / 1024 / 1024
}

function selectOllamaModel(ramGb: number): string | null {
  if (ramGb < RAM_MIN_GB) return null
  return defaultModelForRam(ramGb)
}

async function waitForOllama(timeoutMs = 30000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await isOllamaRunning()) return true
    await sleep(500)
  }
  return false
}

async function installOllama(): Promise<boolean> {
  const platform = process.platform
  if (platform === 'win32') {
    console.log(chalk.yellow('Please install Ollama manually from https://ollama.com/download then run rchive again.'))
    return false
  }

  const answer = await prompt(
    chalk.yellow('Ollama is not installed. Install it now? (~500 MB installer + model download) [y/n]: ')
  )
  if (answer.trim().toLowerCase() !== 'y') return false

  const spinner = ora('Installing Ollama...').start()
  try {
    if (platform === 'darwin') {
      execSync('brew install ollama', { stdio: 'pipe' })
      execSync('brew services start ollama', { stdio: 'pipe' })
    } else {
      execSync('curl -fsSL https://ollama.com/install.sh | sh', { stdio: 'pipe' })
      spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' }).unref()
    }
    spinner.succeed('Ollama installed.')
    return await waitForOllama(30000)
  } catch (err) {
    spinner.fail('Ollama installation failed: ' + (err as Error).message)
    return false
  }
}

async function setupGroqOptional(): Promise<void> {
  const config = getConfig()
  if (config.groqApiKey) return

  console.log(chalk.cyan('\nOptional: add a Groq API key for faster conversation summaries.'))
  console.log(chalk.gray('(Groq is only used for one summary per conversation — not per chunk)'))
  const answer = await prompt('Set up Groq summaries? [y/n]: ')
  if (answer.trim().toLowerCase() !== 'y') return

  console.log(chalk.gray('Get a free key at https://console.groq.com/keys'))
  for (let attempt = 0; attempt < 3; attempt++) {
    const key = await prompt('Paste Groq API key (or Enter to skip): ')
    if (!key.trim()) return
    const spinner = ora('Validating...').start()
    try {
      const Groq = (await import('groq-sdk')).default
      const client = new Groq({ apiKey: key.trim() })
      await client.models.list()
      await saveGroqKey(key.trim())
      spinner.succeed(chalk.green('✓ Groq key saved — will be used for conversation summaries.'))
      return
    } catch (err) {
      spinner.fail('Invalid key: ' + (err as Error).message)
    }
  }
}

export async function runFirstTimeSetup(): Promise<void> {
  const config = getConfig()
  if (config.enrichmentAcknowledged && config.enrichmentProvider) return

  const ramGb = getRamGb()
  const model = selectOllamaModel(ramGb)

  if (!model) {
    console.log(chalk.red(
      `\nYour system has ${ramGb.toFixed(1)} GB RAM. rchive requires at least ${RAM_MIN_GB} GB to run a local model.\nEnrichment disabled.`
    ))
    saveConfig({ ...getConfig(), enrichmentAcknowledged: true })
    closeSetupRL()
    return
  }

  console.log(chalk.yellow('\n⚠️  First-run enrichment setup'))
  console.log(`Enrichment runs entirely on your machine using ${chalk.cyan(model)}.`)
  console.log(chalk.gray('Topics, summaries, and compressed content are generated locally — nothing leaves your computer.\n'))

  const answer = await prompt('Set up local enrichment now? [y/n]: ')
  if (answer.trim().toLowerCase() !== 'y') {
    saveConfig({ ...getConfig(), enrichmentAcknowledged: true })
    closeSetupRL()
    return
  }

  const running = await isOllamaRunning()
  if (!running) {
    const installed = await installOllama()
    if (!installed) {
      console.log(chalk.red('Enrichment setup incomplete — Ollama unavailable.'))
      saveConfig({ ...getConfig(), enrichmentAcknowledged: true })
      closeSetupRL()
      return
    }
  }

  const spinner = ora(`Pulling ${model}...`).start()
  try {
    await pullModelWithProgress(model, (pct, status) => {
      if (pct !== null) {
        spinner.text = `Pulling ${model}... ${pct}%`
      } else if (status && status !== 'success') {
        spinner.text = `Pulling ${model}: ${status}`
      }
    })
    spinner.succeed(`${model} ready.`)
  } catch (err) {
    spinner.fail('Model download failed: ' + (err as Error).message)
    console.log(chalk.red('Enrichment setup incomplete.'))
    saveConfig({ ...getConfig(), enrichmentAcknowledged: true })
    closeSetupRL()
    return
  }

  saveConfig({
    ...getConfig(),
    enrichmentProvider: 'ollama',
    ollamaModel: model,
    enrichmentAcknowledged: true,
  })
  console.log(chalk.green(`✓ Local enrichment ready (${model}).`))

  await setupGroqOptional()
  closeSetupRL()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

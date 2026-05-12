import os from 'os'
import { execSync, spawn } from 'child_process'
import readline from 'readline'
import chalk from 'chalk'
import ora from 'ora'
import { getConfig, saveConfig, saveGroqKey, EnrichmentProvider } from '../config'
import { isOllamaRunning } from './ollama'

const OLLAMA_TEST_URL = 'http://localhost:11434/api/tags'

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans) }))
}

function getRamGb(): number {
  return os.totalmem() / 1024 / 1024 / 1024
}

function selectOllamaModel(ramGb: number): string | null {
  if (ramGb < 8) return null
  if (ramGb < 16) return 'phi3.5'
  return 'llama3.2'
}

async function waitForOllama(timeoutMs = 10000): Promise<boolean> {
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
    console.log(
      chalk.yellow(
        'Please install Ollama manually from https://ollama.com/download then run rchive again.'
      )
    )
    return false
  }

  const answer = await prompt(
    chalk.yellow(
      'Ollama is not installed. This will download ~500MB for the installer and ~2–4GB for the model.\nProceed? [y/n]: '
    )
  )
  if (answer.trim().toLowerCase() !== 'y') return false

  const spinner = ora('Installing Ollama...').start()
  try {
    if (platform === 'darwin') {
      execSync('brew install ollama', { stdio: 'pipe' })
    } else {
      execSync('curl -fsSL https://ollama.com/install.sh | sh', { stdio: 'pipe' })
    }
    spinner.succeed('Ollama installed.')
    spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' }).unref()
    return await waitForOllama()
  } catch (err) {
    spinner.fail('Ollama installation failed.')
    console.error((err as Error).message)
    return false
  }
}

async function setupGroq(): Promise<boolean> {
  const config = getConfig()
  const existingKey = config.groqApiKey
  if (existingKey) return true

  console.log(chalk.cyan('A free Groq API key is required for enrichment.'))
  console.log('Opening the Groq signup page in your browser...')
  try {
    const { exec } = await import('child_process')
    const cmd =
      process.platform === 'darwin'
        ? `open https://console.groq.com/signup`
        : process.platform === 'win32'
        ? `start https://console.groq.com/signup`
        : `xdg-open https://console.groq.com/signup`
    exec(cmd)
  } catch {
    console.log(chalk.gray('Could not open browser automatically.'))
  }
  console.log(
    chalk.gray(
      '\nOnce you\'ve created your account:\n  1. Go to https://console.groq.com/keys\n  2. Create a new API key\n'
    )
  )

  for (let attempt = 0; attempt < 3; attempt++) {
    const key = await prompt('Paste your Groq API key: ')
    if (!key.trim()) continue
    const spinner = ora('Validating key...').start()
    try {
      const Groq = (await import('groq-sdk')).default
      const client = new Groq({ apiKey: key.trim() })
      await client.models.list()
      await saveGroqKey(key.trim())
      spinner.succeed(chalk.green('✓ Groq API key saved.'))
      return true
    } catch (err) {
      spinner.fail('Invalid key: ' + (err as Error).message)
    }
  }
  return false
}

export async function runFirstTimeSetup(): Promise<void> {
  const config = getConfig()
  if (config.enrichmentAcknowledged && config.enrichmentProvider) return

  console.log(chalk.yellow('\n⚠️  Enrichment Privacy Notice'))
  console.log('rchive can enrich your conversations using either:')
  console.log('  [1] Local model via Ollama (recommended) — stays 100% on your machine')
  console.log('  [2] Groq API (fast, free) — sends conversation chunks to Groq\'s servers')
  console.log(
    chalk.gray(
      '\nIf your chats contain sensitive information (API keys, personal data,\nconfidential work), choose local enrichment.\n'
    )
  )
  const choice = await prompt('Which would you prefer? [1/2]: ')
  const provider: EnrichmentProvider = choice.trim() === '2' ? 'groq' : 'ollama'

  if (provider === 'ollama') {
    const running = await isOllamaRunning()
    const ramGb = getRamGb()
    const model = selectOllamaModel(ramGb)

    if (!model) {
      console.log(
        chalk.yellow(
          `Your system has ${ramGb.toFixed(1)}GB RAM. A local model requires at least 8GB.\nFalling back to Groq API.`
        )
      )
      const ok = await setupGroq()
      if (!ok) { console.log(chalk.red('Enrichment setup incomplete.')); return }
      saveConfig({ ...getConfig(), enrichmentProvider: 'groq', enrichmentAcknowledged: true })
      return
    }

    if (!running) {
      const installed = await installOllama()
      if (!installed) {
        console.log(chalk.yellow('Falling back to Groq API.'))
        const ok = await setupGroq()
        if (!ok) { console.log(chalk.red('Enrichment setup incomplete.')); return }
        saveConfig({ ...getConfig(), enrichmentProvider: 'groq', enrichmentAcknowledged: true })
        return
      }
    }

    const spinner = ora('Downloading model (this only happens once)...').start()
    try {
      execSync(`ollama pull ${model}`, { stdio: 'pipe' })
      spinner.succeed(`Model ${model} ready.`)
    } catch (err) {
      spinner.fail('Model download failed: ' + (err as Error).message)
      console.log(chalk.yellow('Falling back to Groq API.'))
      const ok = await setupGroq()
      if (!ok) { console.log(chalk.red('Enrichment setup incomplete.')); return }
      saveConfig({ ...getConfig(), enrichmentProvider: 'groq', enrichmentAcknowledged: true })
      return
    }

    saveConfig({ ...getConfig(), enrichmentProvider: 'ollama', ollamaModel: model, enrichmentAcknowledged: true })
    console.log(chalk.green(`✓ Local enrichment configured (${model}).`))
  } else {
    const ok = await setupGroq()
    if (!ok) { console.log(chalk.red('Enrichment setup incomplete.')); return }
    saveConfig({ ...getConfig(), enrichmentProvider: 'groq', enrichmentAcknowledged: true })
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

import os from 'os'
import { execSync, spawn } from 'child_process'
import readline from 'readline'
import chalk from 'chalk'
import ora from 'ora'
import { getConfig, saveConfig, saveEnrichmentApiKey } from '../config.js'
import { isOllamaRunning, pullModelWithProgress } from './ollama.js'
import { validateApiKey } from './api-client.js'
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

export const PROVIDER_PRESETS: { name: string; baseUrl: string; model: string; defaultRpm: number }[] = [
  { name: 'OpenAI',      baseUrl: 'https://api.openai.com/v1',                                model: 'gpt-4o-mini',                                    defaultRpm: 20 },
  { name: 'Groq',        baseUrl: 'https://api.groq.com/openai/v1',                            model: 'llama-3.3-70b-versatile',                        defaultRpm: 25 },
  { name: 'Gemini',      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',  model: 'gemini-2.0-flash',                               defaultRpm: 12 },
  { name: 'OpenRouter',  baseUrl: 'https://openrouter.ai/api/v1',                              model: 'google/gemini-flash-1.5',                        defaultRpm: 20 },
  { name: 'Together AI', baseUrl: 'https://api.together.xyz/v1',                               model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',   defaultRpm: 40 },
  { name: 'Custom',      baseUrl: '',                                                           model: '',                                               defaultRpm: 20 },
]

async function setupApiProvider(): Promise<boolean> {
  console.log(chalk.cyan('\nChoose a provider (or paste a custom OpenAI-compatible base URL):'))
  PROVIDER_PRESETS.forEach((p, i) => {
    const hint = p.baseUrl ? chalk.gray(` — ${p.model}`) : ''
    console.log(`  ${chalk.bold(String(i + 1))}. ${p.name}${hint}`)
  })
  console.log(chalk.gray('  (Claude users: choose OpenRouter and use your Anthropic credits there)\n'))

  const choice = await prompt('Select provider [1–6]: ')
  const idx = parseInt(choice.trim(), 10) - 1

  if (idx < 0 || idx >= PROVIDER_PRESETS.length) {
    console.log(chalk.red('Invalid choice.'))
    return false
  }

  const preset = PROVIDER_PRESETS[idx]
  let baseUrl = preset.baseUrl
  let model = preset.model

  if (preset.name === 'Custom') {
    baseUrl = (await prompt('Base URL (e.g. https://api.openai.com/v1): ')).trim()
    if (!baseUrl) { console.log(chalk.red('Base URL required.')); return false }
    if (!isValidApiBaseUrl(baseUrl)) {
      console.log(chalk.red('Base URL must use https:// (or http://localhost for local servers).'))
      return false
    }
    model = (await prompt('Model name: ')).trim()
    if (!model) { console.log(chalk.red('Model name required.')); return false }
  }

  const apiKey = (await prompt(`${preset.name} API key: `)).trim()
  if (!apiKey) { console.log(chalk.red('API key required.')); return false }

  const spinner = ora('Validating API key…').start()
  const result = await validateApiKey(apiKey, baseUrl, model)
  if (!result.ok) {
    spinner.fail(`Validation failed: ${result.error ?? 'unknown error'}`)
    return false
  }
  spinner.succeed('API key valid.')

  const rpmDefault = preset.defaultRpm
  console.log(chalk.gray(`\nRate limit: how many API requests per minute? (protects against accidental large bills)`))
  console.log(chalk.gray(`Suggested for ${preset.name}: ${rpmDefault} RPM`))
  const rpmInput = await prompt(`RPM [${rpmDefault}]: `)
  const rpm = parseInt(rpmInput.trim(), 10)
  const resolvedRpm = Number.isFinite(rpm) && rpm > 0 ? rpm : rpmDefault

  await saveEnrichmentApiKey(apiKey)
  saveConfig({
    ...getConfig(),
    enrichmentProvider: 'api',
    enrichmentApiBaseUrl: baseUrl,
    enrichmentApiModel: model,
    enrichmentRpm: resolvedRpm,
    enrichmentAcknowledged: true,
  })
  console.log(chalk.green(`✓ API enrichment ready (${preset.name} · ${model} · ${resolvedRpm} RPM).`))
  return true
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
    console.log(chalk.yellow('Please install Ollama manually from https://ollama.com/download then run rchive setup again.'))
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

async function setupOllamaProvider(): Promise<boolean> {
  const ramGb = getRamGb()
  const model = ramGb < RAM_MIN_GB ? null : defaultModelForRam(ramGb)

  if (!model) {
    console.log(chalk.red(
      `\nYour system has ${ramGb.toFixed(1)} GB RAM. Local Ollama requires at least ${RAM_MIN_GB} GB.`
    ))
    return false
  }

  const running = await isOllamaRunning()
  if (!running) {
    const installed = await installOllama()
    if (!installed) {
      console.log(chalk.red('Ollama unavailable. Run rchive setup to try again.'))
      return false
    }
  }

  const spinner = ora(`Pulling ${model}...`).start()
  try {
    await pullModelWithProgress(model, (pct, status) => {
      if (pct !== null) spinner.text = `Pulling ${model}... ${pct}%`
      else if (status && status !== 'success') spinner.text = `Pulling ${model}: ${status}`
    })
    spinner.succeed(`${model} ready.`)
  } catch (err) {
    spinner.fail('Model download failed: ' + (err as Error).message)
    return false
  }

  saveConfig({
    ...getConfig(),
    enrichmentProvider: 'ollama',
    ollamaModel: model,
    enrichmentAcknowledged: true,
  })
  console.log(chalk.green(`✓ Local enrichment ready (${model}).`))
  return true
}

export async function runFirstTimeSetup(): Promise<void> {
  const config = getConfig()
  if (config.enrichmentAcknowledged && config.enrichmentProvider) return

  console.log(chalk.yellow('\n⚠️  Enrichment setup'))
  console.log('rchive needs an LLM to extract topics, summaries, and compressed content.\n')
  console.log(`  ${chalk.bold('1.')} ${chalk.cyan('API key')}  — use your own key (OpenAI, Groq, Gemini, OpenRouter, etc.)`)
  console.log(`         Fast. Works with any OpenAI-compatible provider.`)
  console.log(`  ${chalk.bold('2.')} ${chalk.cyan('Local Ollama')}  — run a model on your machine`)
  console.log(`         Private. Slow on CPU; fast on Apple Silicon / GPU.`)
  console.log(`  ${chalk.bold('3.')} ${chalk.cyan('Skip')}  — set up later with: rchive setup\n`)

  const choice = await prompt('Choose [1/2/3]: ')

  if (choice.trim() === '1') {
    const ok = await setupApiProvider()
    if (!ok) saveConfig({ ...getConfig(), enrichmentAcknowledged: true })
  } else if (choice.trim() === '2') {
    const ok = await setupOllamaProvider()
    if (!ok) saveConfig({ ...getConfig(), enrichmentAcknowledged: true })
  } else {
    console.log(chalk.gray('Skipped. Run rchive setup when ready.'))
    saveConfig({ ...getConfig(), enrichmentAcknowledged: true })
  }

  closeSetupRL()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isValidApiBaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:') return true
    if (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) return true
    return false
  } catch {
    return false
  }
}

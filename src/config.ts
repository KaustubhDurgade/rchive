import fs from 'fs'
import path from 'path'
import os from 'os'

const CONFIG_DIR = path.join(os.homedir(), '.rchive')
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json')

export type CompressionTier = 'auto' | 'summary' | 'chunks' | 'caveman' | 'full'
export type EnrichmentProvider = 'ollama' | 'api'

export interface RchiveConfig {
  groqApiKey: string
  mcpPort: number
  defaultCompression: CompressionTier
  dbPath: string
  enrichmentProvider: EnrichmentProvider | null
  ollamaModel: string | null
  enrichmentAcknowledged: boolean
  enrichmentApiKey: string
  enrichmentApiBaseUrl: string
  enrichmentApiModel: string
  enrichmentRpm: number
  providers: {
    gemini?: {
      accessToken: string
      refreshToken: string
      lastSyncedAt: number
    }
    chatgpt?: {
      lastImportedAt: number
    }
    claude?: {
      lastImportedAt: number
    }
  }
}

const DEFAULTS: RchiveConfig = {
  groqApiKey: '',
  mcpPort: 3456,
  defaultCompression: 'auto',
  dbPath: path.join(CONFIG_DIR, 'rchive.db'),
  enrichmentProvider: null,
  ollamaModel: null,
  enrichmentAcknowledged: false,
  enrichmentApiKey: '',
  enrichmentApiBaseUrl: '',
  enrichmentApiModel: '',
  enrichmentRpm: 20,
  providers: {},
}

export function getConfig(): RchiveConfig {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2), 'utf8')
    return { ...DEFAULTS }
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
  const parsed = JSON.parse(raw) as Partial<RchiveConfig>
  return { ...DEFAULTS, ...parsed }
}

export function saveConfig(config: RchiveConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  const tmp = CONFIG_PATH + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8')
  fs.renameSync(tmp, CONFIG_PATH)
}

// keytar helpers — fall back to config file if keytar unavailable
let _keytar: typeof import('keytar') | null | undefined = undefined

async function getKeytar(): Promise<typeof import('keytar') | null> {
  if (_keytar !== undefined) return _keytar
  try {
    const mod = await import('keytar')
    // Dynamic import of a CJS module returns { default: module } in ESM
    _keytar = ((mod as unknown as { default: typeof import('keytar') }).default ?? mod) as typeof import('keytar')
    return _keytar
  } catch {
    _keytar = null
    return null
  }
}

const KEYCHAIN_SERVICE = 'rchive'
const GROQ_KEY_ACCOUNT = 'groq-api-key'
const API_KEY_ACCOUNT = 'enrichment-api-key'

export async function getGroqKey(): Promise<string> {
  const kt = await getKeytar()
  if (kt) {
    const stored = await kt.getPassword(KEYCHAIN_SERVICE, GROQ_KEY_ACCOUNT)
    if (stored) return stored
  }
  return getConfig().groqApiKey
}

export async function saveGroqKey(key: string): Promise<void> {
  const kt = await getKeytar()
  if (kt) {
    await kt.setPassword(KEYCHAIN_SERVICE, GROQ_KEY_ACCOUNT, key)
  } else {
    const config = getConfig()
    saveConfig({ ...config, groqApiKey: key })
  }
}

export async function getEnrichmentApiKey(): Promise<string> {
  const kt = await getKeytar()
  if (kt) {
    const stored = await kt.getPassword(KEYCHAIN_SERVICE, API_KEY_ACCOUNT)
    if (stored) return stored
  }
  return getConfig().enrichmentApiKey
}

export async function saveEnrichmentApiKey(key: string): Promise<void> {
  const kt = await getKeytar()
  if (kt) {
    await kt.setPassword(KEYCHAIN_SERVICE, API_KEY_ACCOUNT, key)
  } else {
    const config = getConfig()
    saveConfig({ ...config, enrichmentApiKey: key })
  }
}

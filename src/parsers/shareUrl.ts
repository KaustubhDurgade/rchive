import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'
import puppeteer, { Browser, Page, HTTPResponse } from 'puppeteer-core'
import { NormalizedConversation, Provider } from '../types.js'
import { parseClaudeConversation } from './claude.js'
import { parseChatGPTConversation } from './chatgpt.js'

const PROFILE_DIR = path.join(os.homedir(), '.rchive', 'chrome-profile')
const WAIT_TIMEOUT_MS = 120000
const POLL_INTERVAL_MS = 500

interface ShareTarget {
  provider: Provider
  shareId: string
  hostFilter: string
}

interface CapturedBody {
  url: string
  body: unknown
}

interface BrowserChoice {
  name: string
  path: string
}

interface ChromiumBrowser extends BrowserChoice {
  bundleId: string
}

const CHROMIUM_BROWSERS: readonly ChromiumBrowser[] = [
  { name: 'Chrome', bundleId: 'com.google.chrome', path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
  { name: 'Comet', bundleId: 'ai.perplexity.comet', path: '/Applications/Comet.app/Contents/MacOS/Comet' },
  { name: 'Brave', bundleId: 'com.brave.browser', path: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' },
  { name: 'Arc', bundleId: 'company.thebrowser.browser', path: '/Applications/Arc.app/Contents/MacOS/Arc' },
  { name: 'Edge', bundleId: 'com.microsoft.edgemac', path: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
  { name: 'Vivaldi', bundleId: 'com.vivaldi.vivaldi', path: '/Applications/Vivaldi.app/Contents/MacOS/Vivaldi' },
  { name: 'Opera', bundleId: 'com.operasoftware.opera', path: '/Applications/Opera.app/Contents/MacOS/Opera' },
  { name: 'Chromium', bundleId: 'org.chromium.chromium', path: '/Applications/Chromium.app/Contents/MacOS/Chromium' },
]

const LINUX_FALLBACKS: readonly BrowserChoice[] = [
  { name: 'Chrome', path: '/usr/bin/google-chrome' },
  { name: 'Chrome', path: '/usr/bin/google-chrome-stable' },
  { name: 'Brave', path: '/usr/bin/brave-browser' },
  { name: 'Edge', path: '/usr/bin/microsoft-edge' },
  { name: 'Chromium', path: '/usr/bin/chromium' },
  { name: 'Chromium', path: '/usr/bin/chromium-browser' },
]

const WINDOWS_FALLBACKS: readonly BrowserChoice[] = [
  { name: 'Chrome', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
  { name: 'Chrome', path: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' },
  { name: 'Edge', path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
  { name: 'Brave', path: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe' },
]

function getMacDefaultBrowserBundleId(): string | null {
  try {
    const plistPath = path.join(
      os.homedir(),
      'Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist'
    )
    const json = execSync(`plutil -extract LSHandlers json -o - "${plistPath}"`, {
      stdio: ['pipe', 'pipe', 'ignore'],
    }).toString()
    const handlers = JSON.parse(json) as Array<{
      LSHandlerURLScheme?: string
      LSHandlerRoleAll?: string
    }>
    for (const handler of handlers) {
      if (handler.LSHandlerURLScheme === 'http' && handler.LSHandlerRoleAll) {
        return handler.LSHandlerRoleAll.toLowerCase()
      }
    }
  } catch {
    return null
  }
  return null
}

function findBrowser(): BrowserChoice | null {
  if (process.platform === 'darwin') {
    const defaultBundleId = getMacDefaultBrowserBundleId()
    if (defaultBundleId) {
      const match = CHROMIUM_BROWSERS.find(
        (b) => b.bundleId === defaultBundleId && fs.existsSync(b.path)
      )
      if (match) return match
    }
    for (const browser of CHROMIUM_BROWSERS) {
      if (fs.existsSync(browser.path)) return browser
    }
    return null
  }
  const fallbacks = process.platform === 'win32' ? WINDOWS_FALLBACKS : LINUX_FALLBACKS
  for (const browser of fallbacks) {
    if (fs.existsSync(browser.path)) return browser
  }
  return null
}

function detectShareTarget(url: string): ShareTarget | null {
  const claudeMatch = url.match(/^https?:\/\/(?:www\.)?claude\.ai\/share\/([a-f0-9-]+)/i)
  if (claudeMatch) {
    return { provider: 'claude', shareId: claudeMatch[1], hostFilter: 'claude.ai' }
  }
  const chatgptMatch = url.match(
    /^https?:\/\/(?:www\.)?(?:chatgpt\.com|chat\.openai\.com)\/share\/([a-zA-Z0-9-]+)/i
  )
  if (chatgptMatch) {
    return { provider: 'chatgpt', shareId: chatgptMatch[1], hostFilter: 'chatgpt.com' }
  }
  return null
}

function looksLikeClaudeShare(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const obj = body as Record<string, unknown>
  return Array.isArray(obj.chat_messages) && typeof obj.uuid === 'string'
}

function looksLikeChatGPTShare(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const obj = body as Record<string, unknown>
  if (obj.mapping && typeof obj.mapping === 'object') return true
  const inner = (obj as { continuous_conversation?: unknown }).continuous_conversation
  if (inner && typeof inner === 'object' && (inner as { mapping?: unknown }).mapping) return true
  return false
}

function unwrapChatGPTShare(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body
  const obj = body as Record<string, unknown>
  if (obj.mapping) return obj
  if (obj.continuous_conversation) return obj.continuous_conversation
  return body
}

function isMatchingCapture(target: ShareTarget, body: unknown): boolean {
  if (target.provider === 'claude') return looksLikeClaudeShare(body)
  return looksLikeChatGPTShare(body)
}

async function captureResponseSafe(response: HTTPResponse): Promise<CapturedBody | null> {
  try {
    const contentType = response.headers()['content-type'] ?? ''
    if (!contentType.includes('json')) return null
    const body = (await response.json()) as unknown
    return { url: response.url(), body }
  } catch {
    return null
  }
}

async function waitForMatch(
  captured: CapturedBody[],
  target: ShareTarget,
  deadline: number
): Promise<CapturedBody | null> {
  while (Date.now() < deadline) {
    const match = captured.find((c) => isMatchingCapture(target, c.body))
    if (match) return match
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  return null
}

async function openShareWithBrowser(
  url: string,
  target: ShareTarget,
  browserPath: string
): Promise<CapturedBody | null> {
  fs.mkdirSync(PROFILE_DIR, { recursive: true })

  const browser: Browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: false,
    userDataDir: PROFILE_DIR,
    defaultViewport: null,
    args: ['--no-first-run', '--no-default-browser-check'],
  })

  const captured: CapturedBody[] = []
  try {
    const page: Page = await browser.newPage()
    page.on('response', async (response) => {
      const respUrl = response.url()
      if (!respUrl.includes(target.hostFilter)) return
      const result = await captureResponseSafe(response)
      if (result) captured.push(result)
    })

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    return await waitForMatch(captured, target, Date.now() + WAIT_TIMEOUT_MS)
  } finally {
    await browser.close().catch(() => undefined)
  }
}

function normalize(target: ShareTarget, body: unknown): NormalizedConversation | null {
  if (target.provider === 'claude') {
    const conv = parseClaudeConversation(body)
    if (!conv) return null
    return { ...conv, provider_conversation_id: `share:${target.shareId}` }
  }
  if (target.provider === 'chatgpt') {
    const conv = parseChatGPTConversation(unwrapChatGPTShare(body))
    if (!conv) return null
    return { ...conv, provider_conversation_id: `share:${target.shareId}` }
  }
  return null
}

export async function importShareUrl(url: string): Promise<NormalizedConversation> {
  const target = detectShareTarget(url)
  if (!target) {
    throw new Error(
      'Unsupported share URL. Expected claude.ai/share/<id> or chatgpt.com/share/<id>.'
    )
  }

  const browser = findBrowser()
  if (!browser) {
    throw new Error(
      'No supported browser found. Install a Chromium-based browser (Chrome, Brave, Arc, Edge, Vivaldi, Opera, or Chromium) and retry. Safari and Firefox are not supported.'
    )
  }

  console.log(`Opening ${browser.name}...`)
  const match = await openShareWithBrowser(url, target, browser.path)
  if (!match) {
    throw new Error(
      `Timed out waiting for ${target.provider} share data. ` +
        `Did the page finish loading?`
    )
  }

  const normalized = normalize(target, match.body)
  if (!normalized) {
    throw new Error('Captured share data but could not normalize it.')
  }
  return normalized
}

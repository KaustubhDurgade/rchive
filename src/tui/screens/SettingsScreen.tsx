import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { getConfig, saveConfig, saveEnrichmentApiKey, CompressionTier, EnrichmentProvider } from '../../config.js'
import { getDb } from '../../db/schema.js'
import { OLLAMA_MODELS } from '../../enrichment/models.js'

const COMPRESSION_TIERS: CompressionTier[] = ['auto', 'summary', 'chunks', 'caveman', 'full']
const ENRICH_MODES: EnrichmentProvider[] = ['api', 'ollama']

type OllamaRow  = 'compression' | 'enrichMode' | 'ollamaModel' | 'port' | 'reEnrich'
type ApiRow     = 'compression' | 'enrichMode' | 'apiBaseUrl'  | 'apiKey' | 'apiModel' | 'apiRpm' | 'port' | 'reEnrich'
type Row = OllamaRow | ApiRow

const ROWS_OLLAMA: OllamaRow[] = ['compression', 'enrichMode', 'ollamaModel', 'port', 'reEnrich']
const ROWS_API: ApiRow[]       = ['compression', 'enrichMode', 'apiBaseUrl', 'apiKey', 'apiModel', 'apiRpm', 'port', 'reEnrich']

interface Props {
  onLock: () => void
  onUnlock: () => void
}

export function SettingsScreen({ onLock, onUnlock }: Props): React.JSX.Element {
  const config = getConfig()

  const [enrichMode, setEnrichMode] = useState<EnrichmentProvider>(
    config.enrichmentProvider === 'api' ? 'api' : 'ollama'
  )
  const activeRows: Row[] = enrichMode === 'api' ? ROWS_API : ROWS_OLLAMA

  const [selectedRow, setSelectedRow] = useState(0)
  const [editingRow, setEditingRow] = useState<Row | null>(null)
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [modelDropdownIdx, setModelDropdownIdx] = useState(
    Math.max(0, OLLAMA_MODELS.findIndex((m) => m.id === config.ollamaModel))
  )

  const [compressionIdx, setCompressionIdx] = useState(
    Math.max(0, COMPRESSION_TIERS.indexOf(config.defaultCompression))
  )
  const [ollamaModel, setOllamaModel] = useState(config.ollamaModel ?? OLLAMA_MODELS[0].id)
  const [apiBaseUrl, setApiBaseUrl] = useState(config.enrichmentApiBaseUrl ?? '')
  const [apiKey, setApiKey] = useState('')          // never pre-fill from config (keytar)
  const [apiModel, setApiModel] = useState(config.enrichmentApiModel ?? '')
  const [apiRpm, setApiRpm] = useState(String(config.enrichmentRpm ?? 20))
  const [port, setPort] = useState(String(config.mcpPort))

  const [saved, setSaved] = useState(false)
  const [enrichStatus, setEnrichStatus] = useState<'idle' | 'started' | 'error'>('idle')

  const openDropdown = () => {
    setModelDropdownIdx(Math.max(0, OLLAMA_MODELS.findIndex((m) => m.id === ollamaModel)))
    setModelDropdownOpen(true)
    onLock()
  }

  const closeDropdown = (select: boolean) => {
    if (select) setOllamaModel(OLLAMA_MODELS[modelDropdownIdx].id)
    setModelDropdownOpen(false)
    onUnlock()
  }

  const startEdit = (row: Row) => { setEditingRow(row); onLock() }
  const finishEdit = () => { setEditingRow(null); onUnlock() }

  const saveAll = () => {
    const parsed = parseInt(port, 10)
    saveConfig({
      ...getConfig(),
      defaultCompression: COMPRESSION_TIERS[compressionIdx],
      enrichmentProvider: enrichMode,
      ollamaModel: enrichMode === 'ollama' ? (ollamaModel || null) : getConfig().ollamaModel,
      enrichmentApiBaseUrl: apiBaseUrl,
      enrichmentApiModel: apiModel,
      enrichmentRpm: parseInt(apiRpm, 10) || 20,
      mcpPort: Number.isFinite(parsed) ? parsed : config.mcpPort,
      enrichmentAcknowledged: true,
    })
    if (enrichMode === 'api' && apiKey) {
      saveEnrichmentApiKey(apiKey).catch(() => {})
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const triggerReEnrich = () => {
    saveAll()
    const db = getDb()
    db.prepare('UPDATE conversations SET enriched = 0').run()
    setEnrichStatus('started')
    import('../../enrichment/pipeline.js')
      .then(({ runEnrichmentPipeline }) => runEnrichmentPipeline(false, true))
      .then((started) => { if (!started) setEnrichStatus('error') })
      .catch(() => setEnrichStatus('error'))
  }

  useInput((input, key) => {
    if (modelDropdownOpen) {
      if (key.upArrow) setModelDropdownIdx((i) => Math.max(0, i - 1))
      else if (key.downArrow) setModelDropdownIdx((i) => Math.min(OLLAMA_MODELS.length - 1, i + 1))
      else if (key.return) closeDropdown(true)
      else if (key.escape) closeDropdown(false)
      return
    }
    if (editingRow !== null) {
      if (key.escape) finishEdit()
      return
    }

    if (key.upArrow) {
      setSelectedRow((r) => Math.max(0, r - 1))
    } else if (key.downArrow) {
      setSelectedRow((r) => Math.min(activeRows.length - 1, r + 1))
    } else if (activeRows[selectedRow] === 'compression') {
      if (key.leftArrow) setCompressionIdx((i) => (i - 1 + COMPRESSION_TIERS.length) % COMPRESSION_TIERS.length)
      else if (key.rightArrow) setCompressionIdx((i) => (i + 1) % COMPRESSION_TIERS.length)
    } else if (activeRows[selectedRow] === 'enrichMode') {
      if (key.leftArrow || key.rightArrow) {
        setEnrichMode((m) => m === 'api' ? 'ollama' : 'api')
        setSelectedRow(0)
      }
    } else if (key.return) {
      const row = activeRows[selectedRow]
      if (row === 'reEnrich') triggerReEnrich()
      else if (row === 'ollamaModel') openDropdown()
      else startEdit(row)
    }

    if (input === 's' && editingRow === null && !modelDropdownOpen) saveAll()
  })

  const maskedKey = (k: string) => k.length > 4 ? '•'.repeat(k.length - 4) + k.slice(-4) : k
  const isLocked = editingRow !== null || modelDropdownOpen

  const pfx = (idx: number) => (
    <Text color={selectedRow === idx ? 'cyan' : 'gray'}>{selectedRow === idx ? '▶ ' : '  '}</Text>
  )
  const lbl = (idx: number, text: string) => (
    <Box width={16}><Text bold={selectedRow === idx}>{text}</Text></Box>
  )

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold>Settings</Text>

      <Box marginTop={1} flexDirection="column">

        {/* Row: Compression */}
        <Box flexDirection="row" marginBottom={1}>
          {pfx(0)}{lbl(0, 'Compression')}
          <Box flexDirection="row">
            <Text dimColor>◀ </Text>
            {COMPRESSION_TIERS.map((tier, i) => (
              <Text key={tier} color={i === compressionIdx ? 'cyan' : 'gray'} bold={i === compressionIdx}>
                {tier}{i < COMPRESSION_TIERS.length - 1 ? '  ' : ''}
              </Text>
            ))}
            <Text dimColor> ▶</Text>
          </Box>
        </Box>

        {/* Row: Enrichment mode toggle */}
        <Box flexDirection="row" marginBottom={1}>
          {pfx(1)}{lbl(1, 'Enrichment')}
          <Text dimColor>◀ </Text>
          {ENRICH_MODES.map((m, i) => (
            <Text key={m} color={m === enrichMode ? 'cyan' : 'gray'} bold={m === enrichMode}>
              {m}{i < ENRICH_MODES.length - 1 ? '  ' : ''}
            </Text>
          ))}
          <Text dimColor> ▶</Text>
        </Box>

        {/* API mode rows */}
        {enrichMode === 'api' && (
          <>
            <Box flexDirection="row" marginBottom={1}>
              {pfx(2)}{lbl(2, 'Base URL')}
              {editingRow === 'apiBaseUrl'
                ? <TextInput value={apiBaseUrl} onChange={setApiBaseUrl} onSubmit={finishEdit} focus={true} />
                : <Text color={apiBaseUrl ? 'cyan' : 'gray'}>{apiBaseUrl || 'not set'}</Text>
              }
            </Box>
            <Box flexDirection="row" marginBottom={1}>
              {pfx(3)}{lbl(3, 'API key')}
              {editingRow === 'apiKey'
                ? <TextInput value={apiKey} onChange={setApiKey} onSubmit={finishEdit} focus={true} />
                : <Text color={apiKey ? 'cyan' : 'gray'}>{apiKey ? maskedKey(apiKey) : '(from keychain — Enter to change)'}</Text>
              }
            </Box>
            <Box flexDirection="row" marginBottom={1}>
              {pfx(4)}{lbl(4, 'Model')}
              {editingRow === 'apiModel'
                ? <TextInput value={apiModel} onChange={setApiModel} onSubmit={finishEdit} focus={true} />
                : <Text color={apiModel ? 'cyan' : 'gray'}>{apiModel || 'not set'}</Text>
              }
            </Box>
            <Box flexDirection="row" marginBottom={1}>
              {pfx(5)}{lbl(5, 'Rate limit')}
              {editingRow === 'apiRpm'
                ? <TextInput value={apiRpm} onChange={setApiRpm} onSubmit={finishEdit} focus={true} />
                : <Text color="cyan">{apiRpm} <Text dimColor>req/min</Text></Text>
              }
            </Box>
          </>
        )}

        {/* Ollama mode rows */}
        {enrichMode === 'ollama' && (
          <Box flexDirection="column" marginBottom={1}>
            <Box flexDirection="row">
              {pfx(2)}{lbl(2, 'Ollama model')}
              <Text color="cyan">{ollamaModel}</Text>
              <Text dimColor>  {modelDropdownOpen ? '▲ ↑↓ Enter Esc' : '▼ Enter to change'}</Text>
            </Box>
            {modelDropdownOpen && (
              <Box marginLeft={4} marginTop={0} flexDirection="column" borderStyle="single" paddingX={1}>
                {OLLAMA_MODELS.map((m, i) => {
                  const active = i === modelDropdownIdx
                  return (
                    <Box key={m.id} flexDirection="row">
                      <Text color={active ? 'cyan' : 'gray'} bold={active}>{active ? '● ' : '  '}</Text>
                      <Box width={16}><Text color={active ? 'cyan' : 'white'} bold={active}>{m.id}</Text></Box>
                      <Box width={8}><Text dimColor>{m.size}</Text></Box>
                      <Box width={8}><Text dimColor>{m.minRam}</Text></Box>
                      <Text dimColor>{m.note}</Text>
                    </Box>
                  )
                })}
              </Box>
            )}
          </Box>
        )}

        {/* MCP port */}
        <Box flexDirection="row" marginBottom={1}>
          {pfx(activeRows.indexOf('port'))}{lbl(activeRows.indexOf('port'), 'MCP port')}
          {editingRow === 'port'
            ? <TextInput value={port} onChange={setPort} onSubmit={finishEdit} focus={true} />
            : <Text color="cyan">{port}</Text>
          }
        </Box>

        {/* Re-enrich */}
        <Box flexDirection="row">
          {pfx(activeRows.indexOf('reEnrich'))}{lbl(activeRows.indexOf('reEnrich'), 'Re-enrich all')}
          {enrichStatus === 'started'
            ? <Text color="green">● Enriching in background — check Status tab</Text>
            : enrichStatus === 'error'
              ? <Text color="red">✗ Failed to start — check setup</Text>
              : <Text dimColor>re-process all conversations</Text>
          }
        </Box>

      </Box>

      <Box marginTop={1}>
        {saved
          ? <Text color="green">✓ Saved</Text>
          : modelDropdownOpen
            ? <Text dimColor>↑↓ select model  ·  Enter confirm  ·  Esc cancel</Text>
            : isLocked
              ? <Text dimColor>Enter to confirm  ·  Esc to cancel</Text>
              : <Text dimColor>↑↓ navigate  ·  ◀▶ toggle mode  ·  Enter to edit  ·  S to save  ·  Tab to switch tabs</Text>
        }
      </Box>
    </Box>
  )
}

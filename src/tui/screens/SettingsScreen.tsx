import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { getConfig, saveConfig, saveGroqKey, CompressionTier } from '../../config.js'
import { getDb } from '../../db/schema.js'
import { OLLAMA_MODELS } from '../../enrichment/models.js'

const COMPRESSION_TIERS: CompressionTier[] = ['auto', 'summary', 'chunks', 'caveman', 'full']
const ROWS = ['compression', 'ollamaModel', 'groqKey', 'port', 'reEnrich'] as const
type Row = typeof ROWS[number]

interface Props {
  onLock: () => void
  onUnlock: () => void
}

export function SettingsScreen({ onLock, onUnlock }: Props): React.JSX.Element {
  const config = getConfig()

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
  const [groqKey, setGroqKey] = useState(config.groqApiKey ?? '')
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

  const startEdit = (row: Row) => {
    setEditingRow(row)
    onLock()
  }

  const finishEdit = () => {
    setEditingRow(null)
    onUnlock()
  }

  const saveAll = () => {
    const parsed = parseInt(port, 10)
    saveConfig({
      ...getConfig(),
      defaultCompression: COMPRESSION_TIERS[compressionIdx],
      ollamaModel: ollamaModel || null,
      mcpPort: Number.isFinite(parsed) ? parsed : config.mcpPort,
      enrichmentProvider: ollamaModel ? 'ollama' : getConfig().enrichmentProvider,
      enrichmentAcknowledged: true,
    })
    if (groqKey) saveGroqKey(groqKey).catch(() => {})
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const triggerReEnrich = () => {
    // Persist current settings first so the pipeline reads the right model
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
      setSelectedRow((r) => Math.min(ROWS.length - 1, r + 1))
    } else if (ROWS[selectedRow] === 'compression') {
      if (key.leftArrow) setCompressionIdx((i) => (i - 1 + COMPRESSION_TIERS.length) % COMPRESSION_TIERS.length)
      else if (key.rightArrow) setCompressionIdx((i) => (i + 1) % COMPRESSION_TIERS.length)
    } else if (key.return) {
      const row = ROWS[selectedRow]
      if (row === 'reEnrich') triggerReEnrich()
      else if (row === 'ollamaModel') openDropdown()
      else startEdit(row)
    }

    if (input === 's' && editingRow === null && !modelDropdownOpen) saveAll()
  })

  const maskedKey = groqKey.length > 4
    ? '•'.repeat(groqKey.length - 4) + groqKey.slice(-4)
    : groqKey

  const isEditing = editingRow !== null
  const isLocked = isEditing || modelDropdownOpen

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

        {/* Row 0 — Compression */}
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

        {/* Row 1 — Ollama model (dropdown) */}
        <Box flexDirection="column" marginBottom={1}>
          <Box flexDirection="row">
            {pfx(1)}{lbl(1, 'Ollama model')}
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

        {/* Row 2 — Groq key */}
        <Box flexDirection="row" marginBottom={1}>
          {pfx(2)}{lbl(2, 'Groq key')}
          {editingRow === 'groqKey'
            ? <TextInput value={groqKey} onChange={setGroqKey} onSubmit={finishEdit} focus={true} />
            : <Text color={groqKey ? 'cyan' : 'gray'}>{groqKey ? maskedKey : 'not set — optional'}</Text>
          }
        </Box>

        {/* Row 3 — MCP port */}
        <Box flexDirection="row" marginBottom={1}>
          {pfx(3)}{lbl(3, 'MCP port')}
          {editingRow === 'port'
            ? <TextInput value={port} onChange={setPort} onSubmit={finishEdit} focus={true} />
            : <Text color="cyan">{port}</Text>
          }
        </Box>

        {/* Row 4 — Re-enrich */}
        <Box flexDirection="row">
          {pfx(4)}{lbl(4, 'Re-enrich all')}
          {enrichStatus === 'started'
            ? <Text color="green">● Enriching in background — check Status tab</Text>
            : enrichStatus === 'error'
              ? <Text color="red">✗ Failed to start — is Ollama running?</Text>
              : <Text dimColor>re-process all conversations with current model</Text>
          }
        </Box>

      </Box>

      <Box marginTop={1}>
        {saved
          ? <Text color="green">✓ Saved</Text>
          : modelDropdownOpen
            ? <Text dimColor>↑↓ select model  ·  Enter confirm  ·  Esc cancel</Text>
            : isEditing
              ? <Text dimColor>Enter to confirm  ·  Esc to cancel</Text>
              : <Text dimColor>↑↓ navigate  ·  Enter to edit/open  ·  S to save  ·  Tab to switch</Text>
        }
      </Box>
    </Box>
  )
}

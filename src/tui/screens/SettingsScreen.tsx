import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { getConfig, saveConfig, CompressionTier } from '../../config'

const COMPRESSION_TIERS: CompressionTier[] = ['auto', 'summary', 'chunks', 'caveman', 'full']

export function SettingsScreen(): React.JSX.Element {
  const config = getConfig()
  const [compression, setCompression] = useState<CompressionTier>(config.defaultCompression)
  const [saved, setSaved] = useState(false)

  useInput((input) => {
    if (input === 's') {
      saveConfig({ ...getConfig(), defaultCompression: compression })
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    }
  })

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold>Settings</Text>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Default compression:</Text>
        <Box flexDirection="row" marginTop={0}>
          {COMPRESSION_TIERS.map((tier) => (
            <Box key={tier} marginRight={2}>
              <Text color={compression === tier ? 'cyan' : undefined}>
                {compression === tier ? '[' : ' '}
                {tier}
                {compression === tier ? ']' : ' '}
              </Text>
            </Box>
          ))}
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text bold>Enrichment provider:</Text>
          <Text>
            {config.enrichmentProvider === 'ollama' && config.ollamaModel
              ? `ollama (${config.ollamaModel})`
              : config.enrichmentProvider ?? 'not configured'}
          </Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text bold>MCP server port:</Text>
          <Text>{config.mcpPort}</Text>
        </Box>

        {config.groqApiKey && (
          <Box marginTop={1} flexDirection="column">
            <Text bold>Groq API key:</Text>
            <Text>{'*'.repeat(Math.max(0, config.groqApiKey.length - 4)) + config.groqApiKey.slice(-4)}</Text>
          </Box>
        )}
      </Box>

      <Box marginTop={1}>
        {saved ? (
          <Text color="green">✓ Saved</Text>
        ) : (
          <Text dimColor>Press S to save  |  Tab to switch screens</Text>
        )}
      </Box>
    </Box>
  )
}

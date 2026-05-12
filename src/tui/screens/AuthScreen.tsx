import React from 'react'
import { Box, Text } from 'ink'
import { getConfig } from '../../config.js'

const PROVIDERS = ['chatgpt', 'claude', 'gemini'] as const

function formatDate(ts: number | null | undefined): string {
  if (!ts) return 'never'
  return new Date(ts * 1000).toLocaleDateString()
}

export function AuthScreen(): React.JSX.Element {
  const config = getConfig()

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold>Import History</Text>
      <Box marginTop={1} flexDirection="column">
        {PROVIDERS.map((provider) => {
          const providerConfig = config.providers[provider]
          const isConnected = !!providerConfig
          const lastImport = (providerConfig as { lastImportedAt?: number } | undefined)?.lastImportedAt

          return (
            <Box key={provider} flexDirection="row" marginBottom={1}>
              <Text color={isConnected ? 'green' : 'red'}>● </Text>
              <Box flexDirection="column">
                <Text bold>{provider.toUpperCase()}</Text>
                {provider === 'gemini' ? (
                  <Text dimColor>No API available — Gemini not yet supported</Text>
                ) : (
                  <Text dimColor>
                    {isConnected ? `Last import: ${formatDate(lastImport)}` : "Run 'rchive import <file>' to import"}
                  </Text>
                )}
              </Box>
            </Box>
          )
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press Tab to switch screens</Text>
      </Box>
    </Box>
  )
}

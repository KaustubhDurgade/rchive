import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { AuthScreen } from './screens/AuthScreen.js'
import { SettingsScreen } from './screens/SettingsScreen.js'
import { StatusScreen } from './screens/StatusScreen.js'
import { QueryScreen } from './screens/QueryScreen.js'
import { McpScreen } from './screens/McpScreen.js'

type Screen = 'auth' | 'settings' | 'status' | 'query' | 'mcp'
const SCREENS: Screen[] = ['auth', 'settings', 'status', 'query', 'mcp']
const LABELS: Record<Screen, string> = {
  auth: 'Providers',
  settings: 'Settings',
  status: 'Status',
  query: 'Search',
  mcp: 'MCP',
}

export function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('status')
  const [navLocked, setNavLocked] = useState(false)

  useInput((_input, key) => {
    if (navLocked) return
    if (key.tab && !key.shift) {
      const idx = SCREENS.indexOf(screen)
      setScreen(SCREENS[(idx + 1) % SCREENS.length])
    }
    if (key.tab && key.shift) {
      const idx = SCREENS.indexOf(screen)
      setScreen(SCREENS[(idx - 1 + SCREENS.length) % SCREENS.length])
    }
  })

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" paddingX={1} paddingY={0} borderStyle="single" borderBottom={false}>
        {SCREENS.map((s, i) => (
          <Box key={s} marginRight={3}>
            <Text color={screen === s ? 'cyan' : 'gray'} bold={screen === s}>
              {screen === s ? '● ' : '○ '}{i + 1}. {LABELS[s]}
            </Text>
          </Box>
        ))}
        <Box flexGrow={1} justifyContent="flex-end">
          <Text dimColor>Tab/⇧Tab switch  ^C quit</Text>
        </Box>
      </Box>

      <Box borderStyle="single" borderTop={false} flexDirection="column" paddingX={1} paddingY={1}>
        {screen === 'auth' && <AuthScreen />}
        {screen === 'settings' && (
          <SettingsScreen
            onLock={() => setNavLocked(true)}
            onUnlock={() => setNavLocked(false)}
          />
        )}
        {screen === 'status' && <StatusScreen />}
        {screen === 'query' && <QueryScreen />}
        {screen === 'mcp' && <McpScreen />}
      </Box>
    </Box>
  )
}

import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { AuthScreen } from './screens/AuthScreen.js'
import { SettingsScreen } from './screens/SettingsScreen.js'
import { StatusScreen } from './screens/StatusScreen.js'
import { QueryScreen } from './screens/QueryScreen.js'

type Screen = 'auth' | 'settings' | 'status' | 'query'
const SCREENS: Screen[] = ['auth', 'settings', 'status', 'query']
const LABELS: Record<Screen, string> = {
  auth: 'Auth',
  settings: 'Settings',
  status: 'Status',
  query: 'Query',
}

export function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('status')

  useInput((_input, key) => {
    if (key.tab) {
      const idx = SCREENS.indexOf(screen)
      setScreen(SCREENS[(idx + 1) % SCREENS.length])
    }
  })

  return (
    <Box flexDirection="column">
      {/* Tab bar */}
      <Box flexDirection="row" paddingX={2}>
        {SCREENS.map((s) => (
          <Box key={s} marginRight={2}>
            <Text
              color={screen === s ? 'cyan' : 'gray'}
              bold={screen === s}
              underline={screen === s}
            >
              {LABELS[s]}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Screen content */}
      <Box borderStyle="single" flexDirection="column">
        {screen === 'auth' && <AuthScreen />}
        {screen === 'settings' && <SettingsScreen />}
        {screen === 'status' && <StatusScreen />}
        {screen === 'query' && <QueryScreen />}
      </Box>
    </Box>
  )
}

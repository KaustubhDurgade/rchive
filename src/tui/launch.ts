import React from 'react'
import { render } from 'ink'
import { App } from './App'

export async function launchTui(): Promise<void> {
  const { waitUntilExit } = render(React.createElement(App))
  await waitUntilExit()
}

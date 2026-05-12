import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import net from 'net'
import { getConfig } from '../../config.js'

function checkPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: 'localhost', port, timeout: 800 }, () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
    socket.on('timeout', () => { socket.destroy(); resolve(false) })
  })
}

export function McpScreen(): React.JSX.Element {
  const config = getConfig()
  const endpoint = `http://localhost:${config.mcpPort}/mcp`
  const [running, setRunning] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    const poll = async () => {
      const ok = await checkPortOpen(config.mcpPort)
      if (active) setRunning(ok)
    }
    poll()
    const id = setInterval(poll, 3000)
    return () => { active = false; clearInterval(id) }
  }, [config.mcpPort])

  const desktopSnippet = JSON.stringify(
    { mcpServers: { rchive: { url: endpoint } } },
    null,
    2
  )

  const claudeCodeCmd = `claude mcp add rchive --transport http ${endpoint}`
  const cursorCmd = `cursor://settings/mcp  →  add url: ${endpoint}`

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold>MCP Endpoints</Text>

      <Box marginTop={1} flexDirection="row">
        <Text>Server: </Text>
        {running === null && <Text color="yellow">checking…</Text>}
        {running === true && <Text color="green">● running</Text>}
        {running === false && <Text color="red">○ not running  </Text>}
        {running === false && <Text dimColor>start with: rchive serve</Text>}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold color="white">Endpoint</Text>
        <Text color="cyan">{endpoint}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold color="white">Claude Code</Text>
        <Text color="cyan">{claudeCodeCmd}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold color="white">Cursor</Text>
        <Text color="cyan">{cursorCmd}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold color="white">Claude Desktop  (claude_desktop_config.json)</Text>
        <Box borderStyle="single" paddingX={1} marginTop={0} flexDirection="column">
          {desktopSnippet.split('\n').map((line, i) => (
            <Text key={i} color="cyan">{line}</Text>
          ))}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Refreshes every 3s</Text>
      </Box>
    </Box>
  )
}

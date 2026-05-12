import http from 'http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { getDb } from '../db/schema'
import { getConfig } from '../config'
import { handleSearchArchive, searchArchiveSchema } from './tools/searchArchive'
import { handleGetConversation, getConversationSchema } from './tools/getConversation'

export async function startMcpServer(port?: number): Promise<void> {
  const config = getConfig()
  const listenPort = port ?? config.mcpPort
  const db = getDb()

  const mcpServer = new McpServer({
    name: 'rchive',
    version: '1.0.0',
  })

  mcpServer.tool(
    'search_archive',
    'Search your AI conversation history across ChatGPT, Claude, and Gemini. Returns relevant chunks.',
    searchArchiveSchema.shape,
    async (input) => {
      const result = await handleSearchArchive(db, input as z.infer<typeof searchArchiveSchema>)
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
  )

  mcpServer.tool(
    'get_conversation',
    'Retrieve a full conversation by ID. Use when search_archive results need more context.',
    getConversationSchema.shape,
    async (input) => {
      const result = await handleGetConversation(db, input as z.infer<typeof getConversationSchema>)
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
  )

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  })

  await mcpServer.connect(transport)

  const httpServer = http.createServer(async (req, res) => {
    try {
      if (req.method === 'POST' || req.method === 'GET' || req.method === 'DELETE') {
        await transport.handleRequest(req, res)
      } else {
        res.writeHead(405, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
      }
    } catch (err) {
      console.error('[mcp] Request error:', (err as Error).message)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Internal server error' }))
      }
    }
  })

  httpServer.listen(listenPort, 'localhost', () => {
    console.log(`rchive MCP server running on localhost:${listenPort}`)
  })

  process.on('SIGINT', () => { httpServer.close(); process.exit(0) })
  process.on('SIGTERM', () => { httpServer.close(); process.exit(0) })

  // Keep process alive
  await new Promise<void>(() => {})
}

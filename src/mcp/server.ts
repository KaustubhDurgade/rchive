import http from 'http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { getDb } from '../db/schema.js'
import { getConfig } from '../config.js'
import { handleSearchArchive, searchArchiveSchema } from './tools/searchArchive.js'
import { handleGetConversation, getConversationSchema } from './tools/getConversation.js'
import type Database from 'better-sqlite3'

function buildMcpServer(db: Database.Database): McpServer {
  const server = new McpServer({ name: 'rchive', version: '1.0.0' })

  server.tool(
    'search_archive',
    'Search your AI conversation history across ChatGPT, Claude, and Gemini. Returns relevant chunks.',
    searchArchiveSchema.shape,
    async (input) => {
      try {
        const result = await handleSearchArchive(db, input as z.infer<typeof searchArchiveSchema>)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (err) {
        console.error('[mcp] search_archive threw:', (err as Error).message)
        return { content: [{ type: 'text', text: JSON.stringify({ error: (err as Error).message, results: [] }) }] }
      }
    }
  )

  server.tool(
    'get_conversation',
    'Retrieve a full conversation by ID. Use when search_archive results need more context.',
    getConversationSchema.shape,
    async (input) => {
      try {
        const result = await handleGetConversation(db, input as z.infer<typeof getConversationSchema>)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (err) {
        console.error('[mcp] get_conversation threw:', (err as Error).message)
        return { content: [{ type: 'text', text: JSON.stringify({ error: (err as Error).message }) }] }
      }
    }
  )

  return server
}

export async function startMcpServer(port?: number): Promise<void> {
  const config = getConfig()
  const listenPort = port ?? config.mcpPort
  const db = getDb()

  const httpServer = http.createServer(async (req, res) => {
    if (req.method !== 'POST' && req.method !== 'GET' && req.method !== 'DELETE') {
      res.writeHead(405, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Method not allowed' }))
      return
    }

    // Stateless mode requires a fresh server+transport per request
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    const mcpServer = buildMcpServer(db)
    try {
      await mcpServer.connect(transport)
      await transport.handleRequest(req, res)
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

  await new Promise<void>(() => {})
}

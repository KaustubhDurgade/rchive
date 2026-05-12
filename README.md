# rchive

Query your entire AI conversation history — across ChatGPT, Claude, and Gemini —
as context in Claude Code and any MCP-compatible client.

## How it works
1. Import your chat exports
2. rchive enriches them locally with topics and embeddings
3. An MCP server exposes your archive to any AI tool

## Install

```bash
npm install -g rchive
```

## Quick start

```bash
rchive                    # launch setup TUI
rchive import chat.zip    # import ChatGPT or Claude export
rchive serve              # start MCP server
rchive status             # show archive stats
rchive enrich             # manually run enrichment
```

## MCP setup (Claude Code)

Add to your MCP config:
```json
{
  "mcpServers": {
    "rchive": {
      "url": "http://localhost:3456"
    }
  }
}
```

Then run `rchive serve` before starting Claude Code.

## Exporting your chat history

| Provider | How to export |
|----------|--------------|
| ChatGPT  | Settings → Data Controls → Export data → Download ZIP |
| Claude   | Settings → Privacy → Export data → Download ZIP |
| Gemini   | Not yet supported (no public API) |

## Privacy

Everything stays on your machine by default. Enrichment uses a local Ollama model (recommended) or the Groq API (optional, requires a free API key). You choose during first-run setup.

## MCP tools

| Tool | Description |
|------|-------------|
| `search_archive` | Hybrid FTS + vector search across all conversations |
| `get_conversation` | Retrieve a full conversation by ID |

## Tech stack

TypeScript · SQLite · FTS5 · sqlite-vec · @xenova/transformers · Ollama/Groq · ink TUI · MCP SDK

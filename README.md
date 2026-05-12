# rchive

**Local-first AI conversation archive.** Import your ChatGPT and Claude exports, enrich them with topics and embeddings, then query your entire history as context inside Claude Code (or any MCP client) — all on your own machine.

## Install

```bash
npm install -g rchive
```

Node 18+ required. `better-sqlite3` and `sqlite-vec` compile native binaries on install — this takes ~30 seconds on first run.

## Quick start

```bash
# 1. Import your chat history
rchive import ~/Downloads/chatgpt-export.zip
rchive import ~/Downloads/claude-export.zip

# 2. Start the MCP server
rchive serve

# 3. Check what's in your archive
rchive status
```

On first import rchive walks you through enrichment setup — choose a **local Ollama model** (stays 100% on your machine) or the **Groq API** (free, fast, sends chunks to Groq's servers).

## Commands

| Command | Description |
|---------|-------------|
| `rchive` | Launch interactive TUI |
| `rchive import <file.zip>` | Import a ChatGPT or Claude export ZIP |
| `rchive serve [--port n]` | Start the MCP server (default: port 3456) |
| `rchive enrich` | Manually run the enrichment pipeline |
| `rchive status` | Show archive stats (conversations, chunks, DB size) |
| `rchive sync` | (Coming soon) Pull from live provider APIs |

## MCP setup — Claude Code

Add to `~/.claude/claude.json` (or via `claude mcp add`):

```json
{
  "mcpServers": {
    "rchive": {
      "url": "http://localhost:3456"
    }
  }
}
```

Run `rchive serve` before starting Claude Code. Then use naturally:

```
search my archive for X              → search_archive({ query: "X" })
what did I decide about Y            → search_archive({ query: "Y", compression: "summary" })
show me the full conversation about Z → search_archive → get_conversation
```

## MCP tools

| Tool | Inputs | Description |
|------|--------|-------------|
| `search_archive` | `query`, `limit?`, `compression?` | Hybrid FTS5 + vector search across all conversations |
| `get_conversation` | `conversation_id`, `compression?` | Retrieve a full conversation by ID |

**Compression tiers:** `auto` (default) · `summary` · `chunks` · `caveman` · `full`

`auto` routes to `summary` for decision/overview queries and `chunks` for code/technical queries.

## Exporting your chat history

| Provider | How to export |
|----------|--------------|
| ChatGPT  | Settings → Data Controls → Export data → download ZIP |
| Claude   | Settings → Privacy → Export data → download ZIP |
| Gemini   | Not yet supported (no public conversation history API) |

## Privacy

All data lives in `~/.rchive/rchive.db` on your machine. Enrichment options:

- **Ollama (recommended)** — runs a local LLM (phi3.5 / llama3.2 depending on RAM). Nothing leaves your machine.
- **Groq API** — sends conversation chunks to Groq for enrichment. Fast and free, but requires a [Groq API key](https://console.groq.com/keys).

You choose during first-run setup. You can switch at any time by running `rchive enrich` and reconfiguring.

## Tech stack

TypeScript · SQLite (better-sqlite3) · FTS5 · sqlite-vec · @xenova/transformers · Ollama · Groq · ink TUI · MCP SDK

## Contributing

Issues and PRs welcome at [github.com/KaustubhDurgade/rchive](https://github.com/KaustubhDurgade/rchive).

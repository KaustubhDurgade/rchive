# rchive

[![npm](https://img.shields.io/npm/v/@kaustubhdurgade/rchive)](https://www.npmjs.com/package/@kaustubhdurgade/rchive)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

**Local-first AI conversation archive.** Import your ChatGPT and Claude conversation exports, enrich them with topics and embeddings locally, then query your entire history as context inside Claude Code (or any MCP client), hosted all on your own machine.

---

## How it works

```
┌─ Import ──────────────────────────────────────────────────────────┐
│  ChatGPT .zip  ──┐                                                │
│  Claude .zip   ──┴─▶ parser ──▶ diffAndImport ──▶ SQLite DB       │
│                      (normalises to a common schema)              │
└───────────────────────────────────────────────────────────────────┘

┌─ Enrich (local, background) ──────────────────────────────────────┐
│  DB conversations (enriched=0)                                    │
│    ──▶ chunker      split messages into ~2 000-char chunks        │
│    ──▶ qwen2.5:3b   extract topics · chunk summary · caveman text │
│    ──▶ nomic-embed  384-dim embedding per chunk                   │
│    ──▶ store        chunks table + FTS5 virtual table             │
│                                                                   │
│  Conversation-level summary:                                      │
│    qwen2.5:3b (default)  OR  Groq llama-3.1-8b (if key present)   │
└───────────────────────────────────────────────────────────────────┘

┌─ Search ──────────────────────────────────────────────────────────┐
│  query                                                            │
│    ──▶ FTS5 full-text search        (weight 0.4)                  │
│    ──▶ nomic-embed + sqlite-vec     (weight 0.6)                  │
│    ──▶ merged, deduped, ranked                                    │
│    ──▶ content shaped by compression tier                         │
└───────────────────────────────────────────────────────────────────┘

┌─ MCP server ──────────────────────────────────────────────────────┐
│  http://localhost:3456/mcp                                        │
│    search_archive   hybrid search, returns ranked chunks          │
│    get_conversation full conversation by ID                       │
└───────────────────────────────────────────────────────────────────┘
```

### Compression tiers

When returning search results, rchive can shape the content:

| Tier | What you get | Best for |
|------|-------------|----------|
| `auto` | routes to `summary` or `chunks` automatically | general use |
| `summary` | one-sentence conversation summary | "what did I decide about X?" |
| `chunks` | the matched chunk text | code, technical queries |
| `caveman` | dense stripped prose (all filler removed) — credit to [juliusbrussee/caveman](https://github.com/juliusbrussee/caveman) | fast skim |
| `full` | all messages joined | deep reading |

---

## Install

```bash
npm install -g @kaustubhdurgade/rchive
```

Node 18+ required. `better-sqlite3` and `sqlite-vec` compile native binaries on install (~30 seconds first run).

---

## Quick start

```bash
# 1. Import your chat history
rchive import ~/Downloads/chatgpt-export.zip
rchive import ~/Downloads/claude-export.zip

# 2. Enrich your conversations (run topics, embeddings, summaries)
rchive enrich

# 3. Start the MCP server
rchive serve

# 4. Open the TUI to check status, search, and configure settings
rchive
```

---

## Commands

| Command | Description |
|---------|-------------|
| `rchive` | Launch interactive TUI |
| `rchive import <file.zip>` | Import a ChatGPT or Claude export ZIP |
| `rchive enrich` | Run the enrichment pipeline (foreground, with progress) — can take hours on large archives, good to run overnight |
| `rchive setup` | Re-run enrichment setup (change model, add/change Groq key) |
| `rchive serve [--port n]` | Start the MCP server (default port: 3456) |
| `rchive status` | Print archive stats (conversations, chunks, DB size) |

---

## Enrichment

On first import, rchive walks you through setup. Everything runs **locally** by default.

### What gets enriched

For each chunk of each conversation:
- **Topics** — 2–5 short keyword tags
- **Summary** — one sentence describing the chunk
- **Caveman** — ultra-dense rewrite, all filler stripped

For each conversation:
- **Summary** — one sentence summarising the whole conversation

### Option 1 — Bring your own API key (fast)

Use any OpenAI-compatible provider. rchive walks you through setup and asks for a **rate limit** (requests per minute) to protect against accidental large bills.

| Provider | Free tier | Suggested RPM |
|----------|-----------|--------------|
| [Groq](https://console.groq.com/keys) | ✅ Free | 25 |
| [Gemini](https://aistudio.google.com/apikey) | ✅ Free | 12 |
| [OpenRouter](https://openrouter.ai) | ✅ Free tier | 20 |
| [Together AI](https://api.together.xyz) | pay-as-you-go | 40 |
| OpenAI | pay-as-you-go | 20 |
| Custom (any OpenAI-compatible URL) | — | 20 |

> Claude users: use OpenRouter with your Anthropic credits — it's OpenAI-compatible.

### Option 2 — Local Ollama (private)

rchive uses **Ollama** with `qwen2.5:3b` by default (~2.3 GB RAM). Faster on Apple Silicon (Metal GPU); slow on CPU-only machines.

Minimum requirement: 4 GB RAM.

```bash
# Re-run setup to switch providers or change model
rchive setup
```

---

## TUI

Run `rchive` (no arguments) to open the terminal UI. Navigate with **Tab** / **Shift+Tab**.

| Tab | What it shows |
|-----|--------------|
| Providers | Import history per provider |
| Settings | Edit model, Groq key, port, compression default; reset enrichment |
| Status | Live conversation/chunk counts, enrichment state |
| Search | Hybrid search with expandable results |
| MCP | Endpoint URL + ready-to-paste config snippets |

**Settings screen controls:** `↑↓` to move between fields, `Enter` to edit, `S` to save.

---

## MCP — connecting to Claude Code

```bash
# One-time setup
claude mcp add rchive --transport http http://localhost:3456/mcp

# Start the server (keep it running in a separate terminal or use a process manager)
rchive serve
```

**Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rchive": {
      "url": "http://localhost:3456/mcp"
    }
  }
}
```

The MCP tab in the TUI shows the exact endpoint and copy-paste snippets for all clients.

### MCP tools

#### `search_archive`

Hybrid FTS5 + vector search across all enriched conversations.

**Input**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | `string` | required | Search query in natural language |
| `limit` | `number` | `5` | Number of results to return |
| `compression` | `"auto" \| "summary" \| "chunks" \| "caveman" \| "full"` | `"auto"` | Content shape (see compression tiers above) |

`auto` routing: queries matching decision/overview keywords (`decide`, `chose`, `conclusion`, etc.) resolve to `summary`; code/technical keywords (`function`, `bug`, `api`, `typescript`, etc.) resolve to `chunks`; everything else defaults to `chunks`.

**Response**

```json
{
  "results": [
    {
      "chunk_id": "abc123",
      "conversation_id": "conv-456",
      "conversation_title": "Debugging my auth flow",
      "provider": "chatgpt",
      "created_at": 1700000000,
      "content": "...",
      "topics": ["auth", "jwt", "typescript"],
      "relevance_score": 0.87
    }
  ]
}
```

On error: `{ "error": "message", "results": [] }`

---

#### `get_conversation`

Retrieve a full conversation by ID (obtained from `search_archive` results).

**Input**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `conversation_id` | `string` | required | ID from a `search_archive` result |
| `compression` | `"summary" \| "chunks" \| "caveman" \| "full"` | `"full"` | Content shape |

**Response**

```json
{
  "conversation_id": "conv-456",
  "title": "Debugging my auth flow",
  "provider": "chatgpt",
  "created_at": 1700000000,
  "messages": [
    { "role": "user",      "content": "Why is my JWT expiring early?", "created_at": 1700000010 },
    { "role": "assistant", "content": "This is usually caused by...",  "created_at": 1700000020 }
  ]
}
```

With `compression: "summary"` the `messages` array contains a single `{ "role": "summary", "content": "..." }` entry.
With `compression: "chunks"` or `"caveman"` entries have `"role": "chunk"`.

On error: `{ "error": "Conversation not found: conv-456" }`

---

**Usage in Claude Code**

```
search my archive for X                  → search_archive({ query: "X" })
what did I decide about Y                → search_archive({ query: "Y", compression: "summary" })
show me the full conversation about Z    → search_archive → get_conversation({ conversation_id: "..." })
```

---

## Exporting your chat history

| Provider | Steps |
|----------|-------|
| ChatGPT  | Settings → Data Controls → Export data → download ZIP |
| Claude   | Settings → Privacy → Export data → download ZIP |
| Gemini   | Not yet supported — no public conversation history API |

---

## Data & privacy

All data lives in `~/.rchive/rchive.db`. The config is at `~/.rchive/config.json`.

Chunk enrichment (the high-volume work) **always runs locally** via Ollama — no conversation content ever leaves your machine by default. The optional Groq key is used only for one short summary per conversation.

---

## Tech stack

TypeScript · SQLite (`better-sqlite3`) · FTS5 · `sqlite-vec` · `@xenova/transformers` (nomic-embed-text-v1) · Ollama (`qwen2.5`) · Groq SDK · ink TUI · MCP SDK (`@modelcontextprotocol/sdk`)

---

## Contributing

Issues and PRs welcome at [github.com/KaustubhDurgade/rchive](https://github.com/KaustubhDurgade/rchive).

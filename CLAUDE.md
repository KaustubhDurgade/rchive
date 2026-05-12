# rchive — Claude Code Session Guide

Read this file at the start of every session.

## What This Project Is
rchive is a local-first CLI + TUI tool for ingesting, enriching, and querying
AI conversation history via MCP. See SPEC.md for full technical specification.

## Project Structure
- src/parsers/     — one parser per AI provider
- src/db/          — schema, queries, diff logic
- src/enrichment/  — chunking, embeddings, groq/ollama
- src/search/      — FTS5 + vector hybrid search
- src/mcp/         — MCP server and tools
- src/tui/         — ink TUI screens
- src/cli/         — CLI command handlers
- src/cli.ts       — entry point

## Active Branch
Always work on `dev`. Merge to `main` only when a phase is complete and tested.

## AI Archive MCP Access
This project exposes its own archive via MCP on localhost:3456.
To query past conversations for context during development, use search_archive.

Usage:
- "search my archive for X"           → search_archive({ query: "X" })
- "what did I decide about Y"         → search_archive({ query: "Y", compression: "summary" })
- "show full conversation about Z"    → search_archive → get_conversation
- Default to compression: "auto" unless user specifies otherwise
- If no results, broaden query terms before giving up

## Commit Format
type: short description
Types: init | feat | fix | refactor | test | docs | chore

## Key Rules
- Never crash on bad import data — log warning and continue
- Enrichment always runs as a non-blocking background job
- Never send data to Groq without user's explicit enrichment provider choice
- Always ask user before downloading ollama or model files
- Gemini is stubbed — no public API available as of Phase 1

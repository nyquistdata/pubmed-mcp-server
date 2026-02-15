# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A production-grade Model Context Protocol (MCP) server that bridges AI agents to the PubMed biomedical literature database via NCBI's E-utilities APIs (ESearch, EFetch, ESummary, ELink). Built on `@modelcontextprotocol/sdk`, it exposes five MCP tools and supports both stdio and HTTP transports.

## Common Commands

- `npm run build` — Compile TypeScript to `dist/`
- `npm run rebuild` — Clean and build
- `npm start` — Run server (stdio transport)
- `npm run start:http` — Run server (HTTP transport)
- `npm run lint` — ESLint
- `npm run lint:fix` — ESLint with auto-fix
- `npm run format` — Prettier formatting
- `npm test` — Run all tests (Vitest)
- `npm run test:watch` — Watch mode
- `npm run test:coverage` — Tests with coverage
- `npm run inspector` — Launch MCP Inspector (stdio)
- `npm run inspector:http` — Launch MCP Inspector (HTTP)

## Architecture

### Startup Flow

`src/index.ts` is the entry point. OpenTelemetry instrumentation (`src/utils/telemetry/instrumentation.ts`) is imported **first** before any other module to enable automatic library patching. The entry point initializes the logger, then calls `initializeAndStartServer()` in `src/mcp-server/server.ts`, which creates the McpServer instance, registers all tools, and starts the selected transport.

### Tool Structure

Each tool lives in `src/mcp-server/tools/<toolName>/` with three files:

- **`index.ts`** — Barrel file exporting only the `register...` function
- **`logic.ts`** — Zod input schema, TypeScript types, and business logic function. Complex tools may split logic into a `logic/` subdirectory.
- **`registration.ts`** — Registers tool with McpServer, wraps logic calls in try/catch, formats responses

**The five tools:**
- `pubmedSearchArticles` — ESearch + optional ESummary
- `pubmedFetchContents` — EFetch for article details (abstract, XML, MEDLINE, citation data)
- `pubmedArticleConnections` — ELink for related articles/citations
- `pubmedResearchAgent` — Generates structured research plans (no NCBI API call)
- `pubmedGenerateChart` — Renders charts as PNG via chartjs-node-canvas

### Key Pattern: "Logic Throws, Handler Catches"

This is the core error-handling contract. `logic.ts` throws `McpError` on failure — never catches errors for response formatting. `registration.ts` wraps all logic calls in try/catch, processes errors via `ErrorHandler`, and returns `CallToolResult` with `isError: true/false`.

### Request Context and Tracing

Every operation creates a `RequestContext` via `requestContextService.createRequestContext()` containing a unique `requestId`. This context is threaded through the entire call stack and included in all log entries and OTel spans.

### NCBI Service Layer

`src/services/NCBI/core/` contains a singleton `NcbiService` accessed via `getNcbiService()`. All NCBI API calls go through `NcbiRequestQueueManager` (rate limiting) → `NcbiCoreApiClient` (axios, retries) → `NcbiResponseHandler` (XML parsing via fast-xml-parser). XML parsing helpers are in `src/services/NCBI/parsing/`.

### Transport Layer

- **stdio** (`src/mcp-server/transports/stdio/`) — Default, simple stdin/stdout
- **HTTP** (`src/mcp-server/transports/http/`) — Hono framework with routes: `GET /healthz`, `GET /mcp` (status), `POST /mcp` (tool calls), `DELETE /mcp` (session cleanup)
- **Auth** (`src/mcp-server/transports/auth/`) — JWT or OAuth 2.1 strategies, configurable via `MCP_AUTH_MODE` env var
- **Session modes**: stateless (new McpServer per request), stateful (persistent sessions), auto (defaults to stateful)

### Configuration

`src/config/index.ts` loads and validates all environment variables via Zod. The exported `config` object is the only source for configuration values and secrets. Key env vars: `NCBI_API_KEY`, `MCP_TRANSPORT_TYPE`, `MCP_AUTH_MODE`, `MCP_SESSION_MODE`.

### Utilities

`src/utils/` provides: Winston logger, error handler, request context service, rate limiter, input sanitization (sanitize-html + validator), token counter (tiktoken), date parser (chrono-node), scheduler (node-cron), and OpenTelemetry instrumentation.

## Code Conventions

- TypeScript strict mode with `noUncheckedIndexedAccess`
- ESM modules (`"type": "module"` in package.json, `NodeNext` module resolution)
- Every file starts with `@fileoverview` and `@module` JSDoc blocks
- All exported functions/types have JSDoc comments
- Zod `.describe()` strings on tool parameters are LLM-facing — write them for AI consumption
- Input from external sources must be validated with Zod and sanitized
- Secrets loaded exclusively from env vars via the `config` module
- Format with Prettier before committing

## Testing

Tests use Vitest and follow an **integration-testing-first** approach. Tests go in `tests/` mirroring `src/` structure (e.g., `tests/mcp-server/tools/toolName/integration.test.ts`). Prefer real dependencies over heavy mocking. Mock only truly external, uncontrollable dependencies.

## Docker

Multi-stage build requiring native dependencies for `chartjs-node-canvas` (cairo, pango, jpeg, giflib). Production image runs as non-root `appuser`. Default config: HTTP transport, stateless sessions, port 3017.

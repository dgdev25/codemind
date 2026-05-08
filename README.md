<div align="center">

# CodeMind

### Semantic Code Intelligence for Claude Code

**94% fewer tool calls · 77% faster exploration · 100% local**

[![npm version](https://img.shields.io/npm/v/@colbymchenry/codemind.svg)](https://www.npmjs.com/package/@colbymchenry/codemind)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Windows](https://img.shields.io/badge/Windows-supported-blue.svg)](#)
[![macOS](https://img.shields.io/badge/macOS-supported-blue.svg)](#)
[![Linux](https://img.shields.io/badge/Linux-supported-blue.svg)](#)

<br />

```bash
npx @colbymchenry/codemind
```

<sub>Interactive installer — configures Claude Code automatically in under a minute</sub>

<br />

![CodeMind demo](https://github.com/user-attachments/assets/f168182f-4d9a-44e0-94d7-08d018cc8a3a)

</div>

---

## What is CodeMind?

CodeMind builds a **local semantic knowledge graph** of your codebase — every symbol, call, import, and inheritance relationship — and exposes it to Claude Code as an MCP server.

Instead of spawning Explore agents that grep, glob, and read dozens of files, Claude queries the graph directly. One tool call returns entry points, related symbols, call chains, and source code. The graph stays live as you code via native OS file events.

**No data leaves your machine. No API keys. No external services.**

---

## Benchmark Results

Tested across 6 real-world codebases — Claude Code's Explore agent **with** and **without** CodeMind:

> **Average: 92% fewer tool calls · 71% faster**

| Codebase | With CodeMind | Without CodeMind | Improvement |
|----------|---------------|------------------|-------------|
| **VS Code** · TypeScript | 3 calls, 17s | 52 calls, 1m 37s | **94% fewer · 82% faster** |
| **Excalidraw** · TypeScript | 3 calls, 29s | 47 calls, 1m 45s | **94% fewer · 72% faster** |
| **Claude Code** · Python + Rust | 3 calls, 39s | 40 calls, 1m 8s | **93% fewer · 43% faster** |
| **Claude Code** · Java | 1 call, 19s | 26 calls, 1m 22s | **96% fewer · 77% faster** |
| **Alamofire** · Swift | 3 calls, 22s | 32 calls, 1m 39s | **91% fewer · 78% faster** |
| **Swift Compiler** · Swift/C++ | 6 calls, 35s | 37 calls, 2m 8s | **84% fewer · 73% faster** |

<details>
<summary><strong>Full benchmark details</strong></summary>

All tests used Claude Opus 4.6 (1M context) with Claude Code v2.1.91. Each test spawned a single Explore agent with the same question.

**Queries used:**
| Codebase | Query |
|----------|-------|
| VS Code | "How does the extension host communicate with the main process?" |
| Excalidraw | "How does collaborative editing and real-time sync work?" |
| Claude Code (Python+Rust) | "How does tool execution work end to end?" |
| Claude Code (Java) | "How does tool execution work end to end?" |
| Alamofire | "Trace how a request flows from Session.request() through to the URLSession layer" |
| Swift Compiler | "How does the Swift compiler handle error diagnostics?" |

**With CodeMind:**
| Codebase | Files Indexed | Nodes | Tool Uses | Tokens | Time | File Reads |
|----------|--------------|-------|-----------|--------|------|------------|
| VS Code (TypeScript) | 4,002 | 59,377 | 3 | 56.6k | 17s | 0 |
| Excalidraw (TypeScript) | 626 | 9,859 | 3 | 57.1k | 29s | 0 |
| Claude Code (Python+Rust) | 115 | 3,080 | 3 | 67.1k | 39s | 0 |
| Claude Code (Java) | — | — | 1 | 40.8k | 19s | 0 |
| Alamofire (Swift) | 102 | 2,624 | 3 | 57.3k | 22s | 0 |
| Swift Compiler (Swift/C++) | 25,874 | 272,898 | 6 | 77.4k | 35s | 0 |

**Without CodeMind:**
| Codebase | Tool Uses | Tokens | Time | File Reads |
|----------|-----------|--------|------|------------|
| VS Code (TypeScript) | 52 | 89.4k | 1m 37s | ~15 |
| Excalidraw (TypeScript) | 47 | 77.9k | 1m 45s | ~20 |
| Claude Code (Python+Rust) | 40 | 69.3k | 1m 8s | ~15 |
| Claude Code (Java) | 26 | 73.3k | 1m 22s | ~15 |
| Alamofire (Swift) | 32 | 52.4k | 1m 39s | ~10 |
| Swift Compiler (Swift/C++) | 37 | 99.1k | 2m 8s | ~20 |

**Key observations:**
- With CodeMind, the agent **never fell back to reading files** — it trusted the graph results completely
- Without CodeMind, agents spent most time on discovery (find, ls, grep) before reaching relevant code
- The Java codebase needed only **1 explore call** to answer the entire question
- Cross-language queries (Python+Rust) worked seamlessly — graph traversal finds connections across language boundaries
- The Alamofire benchmark traced a **9-step call chain** from `Session.request()` to `URLSession.dataTask()` in one explore call
- The **Swift Compiler** benchmark (**25,874 files, 272,898 nodes**) was indexed in under 4 minutes; the agent answered a complex cross-cutting question with **6 calls and zero file reads** in 35 seconds

</details>

---

## Features

| | |
|---|---|
| **Semantic Search** | Natural language search powered by vector embeddings — find code by intent, not just by name |
| **Smart Context** | One tool call returns entry points, related symbols, and code snippets for any task |
| **Full-Text Search** | Instant FTS5-powered symbol search across the entire codebase |
| **Impact Analysis** | Trace callers, callees, and the full impact radius of any symbol before making changes |
| **Always Fresh** | Native OS file events (FSEvents/inotify/ReadDirectoryChangesW) with debounced auto-sync — zero config |
| **19+ Languages** | TypeScript, JavaScript, Python, Go, Rust, Java, C#, PHP, Ruby, C, C++, Swift, Kotlin, Dart, Svelte, Vue, Liquid, Pascal/Delphi |
| **Framework-aware Routes** | Recognizes routing patterns across 13 frameworks and links URL patterns to handlers |
| **100% Local** | No data leaves your machine. No API keys. SQLite only. |

---

## Quick Start

### 1. Run the Installer

```bash
npx @colbymchenry/codemind
```

The installer:
- Installs `codemind` globally
- Configures the MCP server in `~/.claude.json`
- Sets up auto-allow permissions for CodeMind tools
- Adds global instructions to `~/.claude/CLAUDE.md`
- Optionally initializes your current project

### 2. Restart Claude Code

The MCP server loads on next start.

### 3. Initialize Your Project

```bash
cd your-project
codemind init -i
```

That's it. Claude Code will use CodeMind automatically whenever a `.codemind/` directory exists.

<details>
<summary><strong>Manual Setup</strong></summary>

**Install globally:**
```bash
npm install -g @colbymchenry/codemind
```

**Add to `~/.claude.json`:**
```json
{
  "mcpServers": {
    "codemind": {
      "type": "stdio",
      "command": "codemind",
      "args": ["serve", "--mcp"]
    }
  }
}
```

**Add to `~/.claude/settings.json` (auto-allow tools):**
```json
{
  "permissions": {
    "allow": [
      "mcp__codemind__codemind_search",
      "mcp__codemind__codemind_context",
      "mcp__codemind__codemind_explore",
      "mcp__codemind__codemind_callers",
      "mcp__codemind__codemind_callees",
      "mcp__codemind__codemind_impact",
      "mcp__codemind__codemind_node",
      "mcp__codemind__codemind_files",
      "mcp__codemind__codemind_status",
      "mcp__codemind__codemind_semantic_search",
      "mcp__codemind__codemind_similar",
      "mcp__codemind__codemind_vector_status"
    ]
  }
}
```

</details>

---

## How It Works

```
┌─────────────────────────────────────────────────────┐
│                    Claude Code                       │
│                                                      │
│  "Implement user authentication"                     │
│           │                                          │
│           ▼                                          │
│  ┌─────────────────┐    ┌─────────────────┐          │
│  │  Explore Agent  │    │  Explore Agent  │          │
│  └────────┬────────┘    └────────┬────────┘          │
└───────────┼─────────────────────┼────────────────────┘
            │                     │
            ▼                     ▼
┌───────────────────────────────────────────────────────┐
│                  CodeMind MCP Server                   │
│                                                        │
│  codemind_explore  codemind_callers  codemind_search   │
│         │                │                │            │
│         └────────────────┼────────────────┘            │
│                          ▼                             │
│           ┌──────────────────────────┐                 │
│           │      SQLite Graph DB     │                 │
│           │  • Symbols & edges       │                 │
│           │  • FTS5 full-text        │                 │
│           │  • Vector embeddings     │                 │
│           │  • Instant lookups       │                 │
│           └──────────────────────────┘                 │
└───────────────────────────────────────────────────────┘
```

1. **Extraction** — [tree-sitter](https://tree-sitter.github.io/) parses source into ASTs. Language-specific queries extract nodes (functions, classes, methods) and edges (calls, imports, extends, implements).

2. **Storage** — Everything goes into a local SQLite database (`.codemind/codemind.db`) with FTS5 full-text search and optional vector embeddings via `@ruvector/core`.

3. **Resolution** — After extraction, references are resolved: function calls → definitions, imports → source files, class inheritance, and framework-specific routing patterns.

4. **Auto-Sync** — The MCP server watches your project with native OS file events. Changes are debounced (2s quiet window), filtered to source files only, and incrementally synced. The graph stays fresh as you type.

---

## MCP Tools

| Tool | Purpose |
|------|---------|
| `codemind_search` | Find symbols by name across the codebase |
| `codemind_context` | Build relevant code context for a task (primary tool) |
| `codemind_explore` | Deep exploration — full source sections by topic in one call |
| `codemind_callers` | Find everything that calls a function |
| `codemind_callees` | Find everything a function calls |
| `codemind_impact` | Analyze what code is affected by changing a symbol |
| `codemind_node` | Get details about a specific symbol (optionally with source) |
| `codemind_files` | Get indexed file structure (faster than filesystem scanning) |
| `codemind_status` | Check index health and statistics |
| `codemind_semantic_search` | Find code by natural language description using embeddings |
| `codemind_similar` | Find symbols semantically similar to a given symbol |
| `codemind_vector_status` | Check vector index sync status |

---

## CLI Reference

```bash
codemind                          # Run interactive installer
codemind install                  # Run installer (explicit)
codemind init [path]              # Initialize a project (--index to also index)
codemind uninit [path]            # Remove CodeMind from a project
codemind index [path]             # Full index (--force to re-index, --quiet)
codemind sync [path]              # Incremental update
codemind status [path]            # Show statistics
codemind query <search>           # Search symbols (--kind, --limit, --json)
codemind files [path]             # Show file structure (--format, --filter, --max-depth)
codemind context <task>           # Build context for AI (--format, --max-nodes)
codemind affected [files...]      # Find test files affected by changed source files
codemind serve --mcp              # Start MCP server
```

### `codemind affected`

Traces import dependencies transitively to find which test files are affected by changed source files.

```bash
codemind affected src/utils.ts src/api.ts         # Pass files as arguments
git diff --name-only | codemind affected --stdin   # Pipe from git diff
codemind affected src/auth.ts --filter "e2e/*"     # Custom test file pattern
```

**CI / pre-push example:**
```bash
AFFECTED=$(git diff --name-only HEAD | codemind affected --stdin --quiet)
if [ -n "$AFFECTED" ]; then
  npx vitest run $AFFECTED
fi
```

---

## Vector Search (Semantic)

CodeMind supports semantic search via `@ruvector/core` HNSW embeddings:

```bash
codemind index --build-vectors    # Build vector index after initial index
```

Once built, `codemind_semantic_search` and `codemind_similar` tools become available in Claude Code, letting Claude find code by intent rather than by keyword.

Vector config in `.codemind/config.json`:

```json
{
  "vector": {
    "enabled": true,
    "model": "Xenova/all-MiniLM-L6-v2",
    "dimensions": 384,
    "storagePath": ".codemind/vectors",
    "indexOnSync": true,
    "batchSize": 64,
    "quantization": "scalar"
  }
}
```

---

## Library Usage

```typescript
import CodeMind from '@colbymchenry/codemind';

const cg = await CodeMind.open('/path/to/project');

// Full-text symbol search
const results = cg.searchNodes('UserService');

// Graph traversal
const callers = cg.getCallers(results[0].node.id);
const impact  = cg.getImpactRadius(results[0].node.id, 3);

// AI context
const context = await cg.buildContext('fix login bug', {
  maxNodes: 20,
  includeCode: true,
  format: 'markdown',
});

// Semantic search (requires vector index)
const similar = await cg.semanticSearch('token refresh flow', { limit: 10 });

// Auto-sync on file changes
cg.watch();
cg.unwatch();
cg.close();
```

---

## Configuration

`.codemind/config.json`:

```json
{
  "version": 1,
  "languages": ["typescript", "javascript"],
  "exclude": ["node_modules/**", "dist/**", "build/**", "*.min.js"],
  "frameworks": [],
  "maxFileSize": 1048576,
  "extractDocstrings": true,
  "trackCallSites": true
}
```

| Option | Description | Default |
|--------|-------------|---------|
| `languages` | Languages to index (auto-detected if empty) | `[]` |
| `exclude` | Glob patterns to ignore | `["node_modules/**", ...]` |
| `frameworks` | Framework hints for better resolution | `[]` |
| `maxFileSize` | Skip files larger than this (bytes) | `1048576` (1MB) |
| `extractDocstrings` | Extract docstrings | `true` |
| `trackCallSites` | Track call site locations | `true` |

---

## Supported Languages

| Language | Extensions | Status |
|----------|-----------|--------|
| TypeScript | `.ts`, `.tsx` | Full |
| JavaScript | `.js`, `.jsx`, `.mjs` | Full |
| Python | `.py` | Full |
| Go | `.go` | Full |
| Rust | `.rs` | Full |
| Java | `.java` | Full |
| C# | `.cs` | Full |
| PHP | `.php` | Full |
| Ruby | `.rb` | Full |
| C | `.c`, `.h` | Full |
| C++ | `.cpp`, `.hpp`, `.cc` | Full |
| Swift | `.swift` | Full |
| Kotlin | `.kt`, `.kts` | Full |
| Scala | `.scala`, `.sc` | Full |
| Dart | `.dart` | Full |
| Svelte | `.svelte` | Full |
| Vue | `.vue` | Full |
| Liquid | `.liquid` | Full |
| Pascal / Delphi | `.pas`, `.dpr`, `.dpk`, `.lpr` | Full |

---

## Framework-aware Routes

CodeMind detects routing files and links URL patterns to handler functions/classes as graph edges.

| Framework | Patterns |
|-----------|----------|
| **Django** | `path()`, `re_path()`, `url()`, `include()` in `urls.py` |
| **Flask** | `@app.route(...)`, blueprint routes |
| **FastAPI** | `@app.get(...)`, `@router.post(...)` |
| **Express** | `app.get(...)`, `router.post(...)` with middleware chains |
| **Laravel** | `Route::get()`, `Route::resource()`, `Controller@action` |
| **Rails** | `get '/x', to: 'users#index'` |
| **Spring** | `@GetMapping`, `@PostMapping`, `@RequestMapping` |
| **Gin / chi / gorilla** | `r.GET(...)`, `router.HandleFunc(...)` |
| **Axum / actix / Rocket** | `.route("/x", get(handler))` |
| **ASP.NET** | `[HttpGet("/x")]` on action methods |
| **Vapor** | `app.get("x", use: handler)` |
| **React Router** / **SvelteKit** | Route component nodes |

---

## Troubleshooting

**"CodeMind not initialized"** — Run `codemind init` in your project directory first.

**Indexing is slow** — Verify `node_modules` and `dist` are excluded. Use `--quiet` to reduce output overhead.

**MCP server not connecting** — Verify the project is initialized and `codemind serve --mcp` runs without error from the terminal.

**Missing symbols** — The server auto-syncs on save (2s debounce). Run `codemind sync` manually if needed. Check the file language is supported and not excluded.

**Vector search returns nothing** — Run `codemind index --build-vectors` to build the embedding index. Check `codemind_vector_status` in Claude Code to see sync progress.

---

## License

MIT

---

<div align="center">

> **Fork notice:** CodeMind is a fork of [CodeGraph](https://github.com/colbymchenry/codegraph) by [@colbymchenry](https://github.com/colbymchenry), extended with vector search, semantic embeddings, and a renamed CLI.

[Report Bug](https://github.com/dgdev25/codemind/issues) · [Request Feature](https://github.com/dgdev25/codemind/issues)

</div>

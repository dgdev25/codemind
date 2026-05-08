<div align="center">

# CodeMind

**A local knowledge graph that gives Claude Code instant structural understanding of any codebase.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Windows](https://img.shields.io/badge/Windows-supported-blue.svg)](#)
[![macOS](https://img.shields.io/badge/macOS-supported-blue.svg)](#)
[![Linux](https://img.shields.io/badge/Linux-supported-blue.svg)](#)

```bash
git clone https://github.com/dgdev25/codemind.git
cd codemind && npm install && npm run build && npm link
```

<sub>See <a href="#getting-started">Getting Started</a> for full setup</sub>

![CodeMind demo](https://github.com/user-attachments/assets/f168182f-4d9a-44e0-94d7-08d018cc8a3a)

</div>

---

## The Problem

When Claude Code explores a codebase, it scans. It greps, lists directories, reads files one by one, builds up a mental model from scratch — every single session. On a medium-sized project, answering "how does the auth system work?" burns 40–50 tool calls and over a minute of wall time before a single line of real work begins.

That scanning loop is the bottleneck.

## How CodeMind Fixes It

CodeMind indexes your codebase once into a local SQLite knowledge graph, then exposes it to Claude Code via an MCP server. Instead of scanning files, Claude queries the graph.

```
WITHOUT CodeMind                         WITH CodeMind
────────────────────────────────         ─────────────────────────────────
"How does auth work?"                    "How does auth work?"
                                                  │
  grep -r "auth" .              (6s)              ▼
  ls src/middleware/            (1s)    codemind_explore "auth"  (1 call)
  read src/auth/index.ts        (3s)
  read src/middleware/auth.ts   (3s)      Returns immediately:
  grep -r "session" .           (6s)      • AuthService, JwtMiddleware,
  read src/session/manager.ts   (3s)        SessionStore — with locations
  grep -r "JwtMiddleware" .     (5s)      • Full call chain: login()
  read src/types/user.ts        (3s)        → validateToken() → SessionStore
  ... 44 more tool calls ...              • Source code for key functions
                                          • Related symbols and imports
  52 tool calls   1m 37s                  • Framework route bindings

                                          3 tool calls    17s
```

The graph is built once, stays current via a file watcher, and is queried in milliseconds.

---

## Benchmark Results

Tested across 6 real-world codebases — same question, same model, with and without CodeMind:

| Codebase | With CodeMind | Without CodeMind | Improvement |
|----------|:-------------:|:----------------:|:-----------:|
| VS Code · TypeScript | 3 calls, 17s | 52 calls, 1m 37s | **94% fewer · 82% faster** |
| Excalidraw · TypeScript | 3 calls, 29s | 47 calls, 1m 45s | **94% fewer · 72% faster** |
| Claude Code · Python + Rust | 3 calls, 39s | 40 calls, 1m 8s | **93% fewer · 43% faster** |
| Claude Code · Java | 1 call, 19s | 26 calls, 1m 22s | **96% fewer · 77% faster** |
| Alamofire · Swift | 3 calls, 22s | 32 calls, 1m 39s | **91% fewer · 78% faster** |
| Swift Compiler · Swift/C++ | 6 calls, 35s | 37 calls, 2m 8s | **84% fewer · 73% faster** |

**Average: 92% fewer tool calls · 71% faster**

In every test, the agent with CodeMind never fell back to reading files — it trusted the graph completely.

<details>
<summary>Full benchmark methodology and raw numbers</summary>

All tests used Claude Opus 4.6 (1M context), Claude Code v2.1.91. A single Explore agent was spawned per test with the same question.

**Queries:**
| Codebase | Question asked |
|----------|---------------|
| VS Code | "How does the extension host communicate with the main process?" |
| Excalidraw | "How does collaborative editing and real-time sync work?" |
| Claude Code (Python+Rust) | "How does tool execution work end to end?" |
| Claude Code (Java) | "How does tool execution work end to end?" |
| Alamofire | "Trace how a request flows from Session.request() through to the URLSession layer" |
| Swift Compiler | "How does the Swift compiler handle error diagnostics?" |

**With CodeMind:**
| Codebase | Files Indexed | Nodes | Tool Uses | Tokens | Time |
|----------|:------------:|:-----:|:---------:|:------:|:----:|
| VS Code | 4,002 | 59,377 | 3 | 56.6k | 17s |
| Excalidraw | 626 | 9,859 | 3 | 57.1k | 29s |
| Claude Code (Py+Rust) | 115 | 3,080 | 3 | 67.1k | 39s |
| Claude Code (Java) | — | — | 1 | 40.8k | 19s |
| Alamofire | 102 | 2,624 | 3 | 57.3k | 22s |
| Swift Compiler | 25,874 | 272,898 | 6 | 77.4k | 35s |

**Without CodeMind:**
| Codebase | Tool Uses | Tokens | Time | File Reads |
|----------|:---------:|:------:|:----:|:----------:|
| VS Code | 52 | 89.4k | 1m 37s | ~15 |
| Excalidraw | 47 | 77.9k | 1m 45s | ~20 |
| Claude Code (Py+Rust) | 40 | 69.3k | 1m 8s | ~15 |
| Claude Code (Java) | 26 | 73.3k | 1m 22s | ~15 |
| Alamofire | 32 | 52.4k | 1m 39s | ~10 |
| Swift Compiler | 37 | 99.1k | 2m 8s | ~20 |

Notable: the Alamofire benchmark traced a 9-step call chain from `Session.request()` to `URLSession.dataTask()` in a single explore call. The Swift Compiler (25,874 files, 272,898 nodes) was indexed in under 4 minutes and answered a complex cross-cutting question with 6 calls and zero file reads.

</details>

---

## Getting Started

**Step 1 — Clone and build:**

```bash
git clone https://github.com/dgdev25/codemind.git
cd codemind
npm install
npm run build
npm link          # makes the `codemind` command available globally
```

**Step 2 — Run the installer:**

```bash
codemind install
```

This wires up the MCP server in `~/.claude.json`, configures tool permissions, and adds usage instructions to `~/.claude/CLAUDE.md`.

**Step 3 — Restart Claude Code** so it picks up the new MCP server.

**Step 4 — Initialize your project:**

```bash
cd your-project
codemind init -i
```

The `-i` flag runs the full index immediately. From here, the MCP server auto-syncs as you edit files.

<details>
<summary>Manual MCP server setup</summary>

**Register the MCP server in `~/.claude.json`:**
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

**Auto-allow tool permissions in `~/.claude/settings.json`:**
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

## Under the Hood

```
  Your source files
  ─────────────────
  .ts  .py  .go  .rs             tree-sitter parses each file into an AST.
  .java  .rb  .swift             Language-specific queries extract symbols
  .cs  .php  .kt  ...            (functions, classes, methods, routes) and
        │                        relationships (calls, imports, extends).
        │
        ▼
  ┌─────────────────────────────────────────────┐
  │              .codemind/codemind.db           │
  │                                              │
  │  nodes ──── edges ──── files                 │
  │  (symbols)  (relations)  (hashes)            │
  │                                              │
  │  FTS5 full-text index                        │
  │  HNSW vector index  (optional, ruVector)     │
  └────────────────────┬────────────────────────┘
                       │  live sync via
                       │  OS file events
                       │  (FSEvents / inotify /
                       │   ReadDirectoryChangesW)
                       │
                       ▼
             codemind MCP server
             ────────────────────
             codemind_explore          deep topic exploration
             codemind_search           symbol lookup by name
             codemind_callers          who calls this function?
             codemind_callees          what does this call?
             codemind_impact           what breaks if I change this?
             codemind_context          task-focused context bundle
             codemind_semantic_search  find by meaning, not keyword
             codemind_similar          find equivalent implementations
             codemind_node             symbol details + source
             codemind_files            project structure
             + codemind_status, codemind_vector_status
```

References are resolved after extraction: function calls are linked to their definitions, imports to their source files, class hierarchies are traced, and web-framework route patterns are bound to their handler functions.

---

## MCP Tools

| Tool | What it does |
|------|-------------|
| `codemind_explore` | Deep exploration — returns full source sections grouped by file for a topic, in one call. The main workhorse for unfamiliar code. |
| `codemind_context` | Task-focused context: entry points, related symbols, and code for a described task. |
| `codemind_search` | Fast symbol lookup by name. Returns locations and signatures, no code. |
| `codemind_callers` | Every function/method that calls a given symbol. |
| `codemind_callees` | Every function/method that a symbol calls. |
| `codemind_impact` | Impact radius — what code could break if this symbol changes. |
| `codemind_node` | Details for a specific symbol: signature, location, optionally source. |
| `codemind_files` | Indexed file tree with language and symbol count metadata. Faster than glob. |
| `codemind_semantic_search` | Natural language search powered by vector embeddings. Requires `--build-vectors`. |
| `codemind_similar` | Find symbols semantically similar to a given one — useful for spotting duplicated logic. |
| `codemind_status` | Index health: file count, node count, edge count, DB size. |
| `codemind_vector_status` | Vector index sync state: how many nodes are embedded vs. pending. |

---

## CLI Reference

```bash
codemind                          # Interactive installer
codemind init [path]              # Initialize a project (-i to index immediately)
codemind uninit [path]            # Remove CodeMind data from a project
codemind index [path]             # Full re-index (--force, --quiet, --build-vectors)
codemind sync [path]              # Incremental sync
codemind status [path]            # Index statistics
codemind query <term>             # CLI symbol search (--kind, --limit, --json)
codemind files [path]             # File tree (--format tree|flat|grouped, --max-depth)
codemind context <task>           # Print AI context to stdout (--format, --max-nodes)
codemind affected [files...]      # Trace which test files are affected by changed sources
codemind serve --mcp              # Start the MCP server (used by Claude Code)
```

### Smart test targeting with `codemind affected`

Traces transitive import dependencies from changed source files to find which test files need to run:

```bash
# Pass files directly
codemind affected src/auth.ts src/session.ts

# Pipe from git
git diff --name-only HEAD | codemind affected --stdin

# In CI — only run affected tests
AFFECTED=$(git diff --name-only HEAD | codemind affected --stdin --quiet)
[ -n "$AFFECTED" ] && npx vitest run $AFFECTED
```

---

## Semantic Search

CodeMind includes optional vector embeddings via [ruVector](https://github.com/ruvnet/ruvector) (`@ruvector/core`) — an HNSW index with scalar quantization running entirely on-device.

```bash
codemind index --build-vectors
```

Once built, `codemind_semantic_search` and `codemind_similar` become available. Claude can find a "token refresh flow" or "retry with backoff" without knowing what the function is called.

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

## Library API

```typescript
import CodeMind from 'codemind';

// Open an indexed project
const cg = await CodeMind.open('/path/to/project');

// Symbol search
const hits = cg.searchNodes('TokenService');

// Graph queries
const callers = cg.getCallers(hits[0].node.id);
const impact  = cg.getImpactRadius(hits[0].node.id, 3);
const chain   = cg.getCallGraph(hits[0].node.id, 4);

// AI context
const context = await cg.buildContext('fix the refresh token bug', {
  maxNodes: 20,
  includeCode: true,
  format: 'markdown',
});

// Semantic search (requires --build-vectors)
const similar = await cg.semanticSearch('rate limiting middleware', { limit: 10 });

// Live sync
cg.watch();    // auto-sync on file save
cg.unwatch();
cg.close();
```

---

## Configuration

`.codemind/config.json` — created automatically on `codemind init`:

```json
{
  "version": 1,
  "languages": ["typescript", "javascript"],
  "exclude": ["node_modules/**", "dist/**", "build/**", "*.min.js"],
  "maxFileSize": 1048576,
  "extractDocstrings": true,
  "trackCallSites": true
}
```

| Field | Description | Default |
|-------|-------------|---------|
| `languages` | Languages to index. Empty = auto-detect from file extensions. | `[]` |
| `exclude` | Glob patterns to skip. | `["node_modules/**", "dist/**", ...]` |
| `maxFileSize` | Skip files larger than this (bytes). Max 100MB. | `1048576` |
| `extractDocstrings` | Pull docstrings/comments into the graph. | `true` |
| `trackCallSites` | Record line/column of each call. | `true` |

---

## Supported Languages

TypeScript · JavaScript · Python · Go · Rust · Java · C# · PHP · Ruby · C · C++ · Swift · Kotlin · Scala · Dart · Svelte · Vue · Liquid · Pascal/Delphi

19 languages, covering `.ts` `.tsx` `.js` `.jsx` `.mjs` `.py` `.go` `.rs` `.java` `.cs` `.php` `.rb` `.c` `.h` `.cpp` `.hpp` `.cc` `.swift` `.kt` `.kts` `.scala` `.sc` `.dart` `.svelte` `.vue` `.liquid` `.pas` `.dpr` `.dpk` `.lpr`

---

## Framework Route Detection

CodeMind emits `route` nodes and links them to their handler functions, so `codemind_callers` on a view returns the URL pattern that reaches it.

Supported: Django · Flask · FastAPI · Express · Laravel · Rails · Spring · Gin · chi · gorilla/mux · Axum · actix-web · Rocket · ASP.NET · Vapor · React Router · SvelteKit · Nuxt

---

## Troubleshooting

**"CodeMind not initialized"** — Run `codemind init` in the project root first.

**MCP server not connecting** — Run `codemind serve --mcp` manually in the terminal to see the error. Usually a missing global install or wrong path in `~/.claude.json`.

**Symbols missing after editing** — The server auto-syncs with a 2-second debounce. Run `codemind sync` to force an immediate update. Check that the file extension is in the supported list and not matched by an `exclude` pattern.

**Semantic search returns nothing** — The vector index needs to be built separately: `codemind index --build-vectors`. Use `codemind_vector_status` in Claude Code to check how many nodes are embedded.

---

## License

MIT

---

<div align="center">

> Fork of [CodeGraph](https://github.com/colbymchenry/codegraph) — extended with vector search, semantic embeddings, and the `codemind` CLI.

[Issues](https://github.com/dgdev25/codemind/issues)

</div>

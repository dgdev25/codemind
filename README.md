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

Select which editors to configure (Claude Code, Cursor, Windsurf). The installer writes the MCP server config for each, auto-allows tool permissions, and adds usage instructions to `~/.claude/CLAUDE.md`.

**Step 3 — Restart your editor(s)** so they pick up the new MCP server.

**Step 4 — Initialize your project:**

```bash
cd your-project
codemind init -i
```

The `-i` flag runs the full index immediately. From here, the MCP server auto-syncs as you edit files.

<details>
<summary>Manual MCP server setup</summary>

The MCP server config is the same format for all supported editors:

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

| Editor | Config file |
|--------|------------|
| Claude Code | `~/.claude.json` |
| Cursor | `~/.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |

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
      "mcp__codemind__codemind_vector_status",
      "mcp__codemind__codemind_flows",
      "mcp__codemind__codemind_clusters",
      "mcp__codemind__codemind_detect_changes"
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
  .svelte  .vue  .liquid  .pas   relationships (calls, imports, extends).
        │
        ▼
  ┌─────────────────────────────────────────────────┐
  │              .codemind/codemind.db               │
  │                                                  │
  │  nodes ──── edges ──── files                     │
  │  (symbols)  (relations)  (hashes)                │
  │                                                  │
  │  execution_flows   precomputed call chains       │
  │  node_communities  label propagation clusters    │
  │                                                  │
  │  FTS5 full-text index  ──┐                       │
  │  HNSW vector index       ├── fused via RRF       │
  │  (optional, ruVector)  ──┘                       │
  └──────────────────┬──────────────────────────────┘
                     │  live sync via OS file events
                     │  + PostEdit hook auto-sync
                     │
                     ▼
           codemind MCP server
           ──────────────────────────────────────────
           codemind_explore          deep topic exploration
           codemind_search           symbol lookup (FTS5 + vector RRF)
           codemind_callers          who calls this function?
           codemind_callees          what does this call?
           codemind_impact           blast radius with confidence tiers
           codemind_context          task-focused context bundle
           codemind_flows            precomputed execution call chains
           codemind_clusters         module community discovery
           codemind_detect_changes   git diff → affected symbols
           codemind_semantic_search  find by meaning, not keyword
           codemind_similar          find equivalent implementations
           codemind_node             symbol details + source
           codemind_files            project structure
           + codemind_status, codemind_vector_status

           MCP prompts (reusable workflows):
           detect_impact   pre-commit blast-radius analysis
           generate_map    architecture overview + Mermaid diagram
           explain_flow    trace execution from an entry point
```

References are resolved after extraction: function calls are linked to their definitions, imports to their source files, class hierarchies are traced, and web-framework route patterns are bound to their handler functions.

---

## MCP Tools

| Tool | What it does |
|------|-------------|
| `codemind_explore` | Deep exploration — returns full source sections grouped by file for a topic, in one call. The main workhorse for unfamiliar code. |
| `codemind_context` | Task-focused context: entry points, related symbols, and code for a described task. |
| `codemind_search` | Fast symbol lookup by name. Fuses FTS5 + vector results via RRF when vector index is available. |
| `codemind_callers` | Every function/method that calls a given symbol. |
| `codemind_callees` | Every function/method that a symbol calls. |
| `codemind_impact` | Blast radius — affected symbols grouped by confidence tier (direct / depth-2 / deep). |
| `codemind_flows` | Precomputed execution call chains from entry points (routes, `main`, exported handlers). Instant — computed at index time. |
| `codemind_clusters` | Module communities detected by label propagation over call and import edges. Discover module boundaries without knowing folder names. |
| `codemind_detect_changes` | Map a git diff to affected symbols and their immediate dependents. Pre-commit analysis. |
| `codemind_node` | Details for a specific symbol: signature, location, optionally source. |
| `codemind_files` | Indexed file tree with language and symbol count metadata. Faster than glob. |
| `codemind_semantic_search` | Natural language search powered by vector embeddings. Requires `--build-vectors`. |
| `codemind_similar` | Find symbols semantically similar to a given one — useful for spotting duplicated logic. |
| `codemind_status` | Index health: file count, node count, edge count, DB size. |
| `codemind_vector_status` | Vector index sync state: how many nodes are embedded vs. pending. |

### MCP Prompts

Reusable workflows discoverable by any MCP-compatible editor:

| Prompt | What it does |
|--------|-------------|
| `detect_impact` | Pre-commit analysis — runs `codemind_detect_changes` + `codemind_impact` and summarises what will break. |
| `generate_map` | Architecture overview — clusters, entry points, file distribution, and a Mermaid diagram. |
| `explain_flow` | Trace execution from a named entry point through the full call chain. |

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
codemind hooks install            # Install PostEdit auto-sync hook in Claude Code
codemind skills generate          # Generate per-community skill files in .claude/skills/codemind/
codemind serve --mcp              # Start the MCP server (used by Claude Code, Cursor, Windsurf)
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

For in-editor pre-commit review, use the `codemind_detect_changes` MCP tool or the `detect_impact` MCP prompt instead — they map the diff directly to symbol-level impact.

### Auto-sync with PostEdit hook

Install a hook that syncs the graph immediately after Claude edits a file (rather than waiting for the 2-second file watcher debounce):

```bash
codemind hooks install
```

Writes a `PostToolUse` hook to `~/.claude/settings.json` that triggers `codemind sync` on Write/Edit/MultiEdit.

### Community-aware skill files

After indexing, generate a per-module context file for each detected code community:

```bash
codemind skills generate
```

Writes `.claude/skills/codemind/<module-name>.md` for each community with ≥5 members — lists key symbols, entry points, and call chains. No LLM required; purely graph-derived.

---

## Execution Flows

CodeMind precomputes call chains from entry points (route handlers, `main`, exported init functions) at index time. The `codemind_flows` MCP tool returns these instantly — no on-demand traversal required.

```
codemind index       # flows are always computed automatically
```

Entry points are auto-detected: `route` nodes, functions named `main`/`run`/`start`/`init`/`setup`/`handler`, and similar.

## Community Clustering

After indexing, CodeMind runs label propagation over `calls` + `imports` + `extends` edges to detect module communities — groups of tightly connected symbols that form logical boundaries in the codebase.

```
codemind_clusters              # discover module communities
codemind skills generate       # generate .claude/skills/codemind/<module>.md per community
```

Clustering runs automatically after `codemind index` for repos up to 100k symbols.

## Semantic Search

CodeMind includes optional vector embeddings via [ruVector](https://github.com/ruvnet/ruvector) (`@ruvector/core`) — an HNSW index with scalar quantization running entirely on-device.

```bash
codemind index --build-vectors
```

Once built, `codemind_semantic_search` and `codemind_similar` become available. `codemind_search` also automatically fuses FTS5 and vector results via Reciprocal Rank Fusion (RRF) for better ranking. Claude can find a "token refresh flow" or "retry with backoff" without knowing what the function is called.

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

**MCP server not connecting** — Run `codemind serve --mcp` manually in the terminal to see the error. Usually a missing global install or wrong path in the editor's MCP config file. See the manual setup table above for config file locations per editor.

**Symbols missing after editing** — The server auto-syncs with a 2-second debounce. Run `codemind sync` to force an immediate update. For instant sync after Claude edits, run `codemind hooks install` to add the PostEdit hook.

**`codemind_flows` returns nothing** — Execution flows are computed during `codemind index`. Run a full re-index if flows are missing.

**`codemind_clusters` returns nothing** — Community detection runs automatically during `codemind index` for repos under 100k symbols. Very large repos skip it to keep indexing fast.

**Semantic search returns nothing** — The vector index needs to be built separately: `codemind index --build-vectors`. Use `codemind_vector_status` in Claude Code to check how many nodes are embedded.

---

## License

MIT

---

<div align="center">

> Fork of [CodeGraph](https://github.com/colbymchenry/codegraph) — extended with vector search, semantic embeddings, and the `codemind` CLI.

[Issues](https://github.com/dgdev25/codemind/issues)

</div>

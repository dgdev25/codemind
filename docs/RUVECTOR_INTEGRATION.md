# CodeGraph × RuVector Integration Design

## Overview

CodeGraph currently uses SQLite + FTS5 for code search — fast and precise for structural/keyword queries, but blind to semantic meaning. This document designs a hybrid intelligence layer that adds RuVector's vector search alongside the existing graph, giving Claude both structural precision and semantic understanding.

**Integration philosophy:** The graph and vector index are complementary, not competing. Keep every existing code path intact. Add vector search as a parallel query lane. Fuse results at the context-building layer.

---

## What Each System Contributes

| Capability | CodeGraph (SQLite+FTS5) | RuVector (`@ruvector/node`) |
|---|---|---|
| Call graph traversal | ✅ Exact BFS/DFS | ❌ |
| Import/dependency chains | ✅ Edge traversal | ❌ |
| Keyword symbol lookup | ✅ FTS5 BM25 | ⚠️ Overkill |
| Semantic natural-language search | ❌ | ✅ Cosine HNSW |
| Cross-naming-convention matching | ❌ | ✅ Embedding space |
| "Find similar functions" | ❌ | ✅ kNN |
| Module-level clustering | ⚠️ Manual | ✅ Leiden community detection (via brain_partition) |
| Hierarchy-aware search | ❌ | ✅ Hyperbolic HNSW |
| Hybrid BM25 + dense fusion | ❌ | ✅ RRF built-in |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude / MCP Client                      │
└───────────────────────┬─────────────────────────────────────────┘
                        │ MCP (JSON-RPC 2.0 stdio)
┌───────────────────────▼─────────────────────────────────────────┐
│                   CodeGraph MCP Server                          │
│                                                                 │
│  Existing tools:          New tools:                            │
│  codegraph_search         codegraph_semantic_search             │
│  codegraph_context        codegraph_similar                     │
│  codegraph_callers        codegraph_cluster                     │
│  codegraph_callees                                              │
│  codegraph_impact         HybridQueryEngine (new)               │
│  codegraph_explore         ├── FTS5 lane  (existing)           │
│  codegraph_node            ├── Vector lane (RuVector)           │
│  codegraph_status          └── RRF fusion                       │
│  codegraph_files                                                │
└────────┬──────────────────────────┬────────────────────────────┘
         │                          │
┌────────▼────────┐        ┌────────▼─────────────────────────────┐
│  SQLite DB      │        │  RuVector VectorDB                   │
│                 │        │  (@ruvector/node NAPI)               │
│  nodes          │        │                                      │
│  edges          │        │  Collection: "codegraph_nodes"       │
│  files          │        │  Dimensions: 384 (MiniLM-L6-v2)     │
│  unresolved_refs│        │  Metric: Cosine                      │
│  nodes_fts(FTS5)│        │  HNSW: m=32, ef_construction=200    │
│  project_metadata│       │  Quantization: scalar (4x compress)  │
│                 │        │                                      │
│  NEW:           │        │  Metadata per vector:               │
│  vector_meta    │        │  { nodeId, kind, language,          │
│  (sync state)   │        │    filePath, name, qualifiedName }  │
└─────────────────┘        └──────────────────────────────────────┘
```

---

## Embedding Strategy

### What to embed per node

Each CodeGraph `Node` produces a single embedding from a composite text document:

```typescript
function buildEmbeddingDocument(node: Node): string {
  const parts: string[] = [];

  // Primary identity
  parts.push(`${node.kind}: ${node.qualifiedName}`);

  // Signature (highest signal for functions/methods)
  if (node.signature) parts.push(node.signature);

  // Documentation (natural language intent)
  if (node.docstring) parts.push(node.docstring);

  // Decorators (framework role: @Controller, @Injectable, etc.)
  if (node.decorators?.length) parts.push(node.decorators.join(' '));

  // Type parameters (generics context)
  if (node.typeParameters?.length) parts.push(`<${node.typeParameters.join(', ')}>`);

  return parts.join('\n');
}
```

**Why this works:** Signature + docstring captures both structure and intent. A function named `ckUsr()` with docstring `"Validates user credentials against bcrypt hash"` will embed near `"authenticate user"` queries even with zero keyword overlap.

### Embedding model

Use `@xenova/transformers` with `all-MiniLM-L6-v2` (384 dimensions, 23MB, runs fully local):

```typescript
import { pipeline } from '@xenova/transformers';

const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

async function embed(text: string): Promise<Float32Array> {
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return new Float32Array(output.data);
}
```

Alternative: `nomic-embed-code` (768d, better for code) if higher accuracy is needed at 2× storage cost.

---

## Database Changes

### New SQLite table: `vector_sync`

Tracks which nodes have been embedded, enabling incremental sync without re-embedding the entire graph on each file change.

```sql
CREATE TABLE IF NOT EXISTS vector_sync (
  node_id      TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  vector_id    TEXT NOT NULL,          -- RuVector entry ID
  content_hash TEXT NOT NULL,          -- hash of embedding document
  embedded_at  INTEGER NOT NULL        -- unix ms
);

CREATE INDEX IF NOT EXISTS idx_vector_sync_embedded_at ON vector_sync(embedded_at);
```

**Sync logic:** On node upsert, compute `contentHash = sha256(buildEmbeddingDocument(node))`. If hash differs from `vector_sync.content_hash`, re-embed and update. If node is deleted (CASCADE), remove vector from RuVector.

---

## New Module: `src/vector/`

### `src/vector/VectorIndex.ts`

```typescript
import { VectorDB, CollectionManager } from '@ruvector/node';
import { Node, NodeKind, Language } from '../types.js';

const DIMENSIONS = 384;
const COLLECTION = 'codegraph_nodes';

export interface VectorSearchResult {
  nodeId: string;
  score: number;
  kind: NodeKind;
  name: string;
  qualifiedName: string;
  filePath: string;
  language: Language;
}

export class VectorIndex {
  private db: VectorDB;
  private ready = false;

  constructor(storagePath: string) {
    this.db = new VectorDB({
      dimensions: DIMENSIONS,
      distanceMetric: 'Cosine',
      storagePath,
      hnswConfig: {
        m: 32,
        efConstruction: 200,
        efSearch: 100,
        maxElements: 500_000,
      },
      quantization: { type: 'scalar' },
    });
  }

  async upsert(node: Node, vector: Float32Array): Promise<string> {
    const metadata = JSON.stringify({
      nodeId: node.id,
      kind: node.kind,
      name: node.name,
      qualifiedName: node.qualifiedName,
      filePath: node.filePath,
      language: node.language,
    });

    // RuVector insert is idempotent when id matches
    const id = await this.db.insert({ id: node.id, vector, metadata });
    return id;
  }

  async upsertBatch(entries: Array<{ node: Node; vector: Float32Array }>): Promise<string[]> {
    return this.db.insertBatch(
      entries.map(({ node, vector }) => ({
        id: node.id,
        vector,
        metadata: JSON.stringify({
          nodeId: node.id,
          kind: node.kind,
          name: node.name,
          qualifiedName: node.qualifiedName,
          filePath: node.filePath,
          language: node.language,
        }),
      }))
    );
  }

  async search(queryVector: Float32Array, k = 20): Promise<VectorSearchResult[]> {
    const results = await this.db.search({ vector: queryVector, k, efSearch: 100 });
    return results
      .filter(r => r.metadata)
      .map(r => {
        const meta = JSON.parse(r.metadata!);
        return { ...meta, score: r.score };
      });
  }

  async searchFiltered(
    queryVector: Float32Array,
    filter: { kind?: NodeKind[]; language?: Language[] },
    k = 20
  ): Promise<VectorSearchResult[]> {
    // Fetch more candidates then post-filter (RuVector scalar quantization is fast enough)
    const candidates = await this.search(queryVector, k * 4);
    return candidates
      .filter(r => {
        if (filter.kind?.length && !filter.kind.includes(r.kind)) return false;
        if (filter.language?.length && !filter.language.includes(r.language)) return false;
        return true;
      })
      .slice(0, k);
  }

  async remove(nodeId: string): Promise<void> {
    await this.db.delete(nodeId);
  }

  async count(): Promise<number> {
    return this.db.len();
  }
}
```

### `src/vector/Embedder.ts`

```typescript
import { createHash } from 'crypto';
import { Node } from '../types.js';

export function buildEmbeddingDocument(node: Node): string {
  const parts: string[] = [`${node.kind}: ${node.qualifiedName}`];
  if (node.signature)                parts.push(node.signature);
  if (node.docstring)                parts.push(node.docstring);
  if (node.decorators?.length)       parts.push(node.decorators.join(' '));
  if (node.typeParameters?.length)   parts.push(`<${node.typeParameters.join(', ')}>`);
  return parts.join('\n');
}

export function contentHash(doc: string): string {
  return createHash('sha256').update(doc).digest('hex').slice(0, 16);
}

export class Embedder {
  private pipeline: ((text: string, opts: object) => Promise<{ data: number[] }>) | null = null;

  async init(): Promise<void> {
    if (this.pipeline) return;
    // Dynamic import keeps startup cost zero for users who don't enable vector
    const { pipeline } = await import('@xenova/transformers');
    this.pipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.pipeline) await this.init();
    const out = await this.pipeline!(text, { pooling: 'mean', normalize: true });
    return new Float32Array(out.data);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    // Sequential with pipelining — MiniLM-L6 is fast enough locally
    return Promise.all(texts.map(t => this.embed(t)));
  }
}
```

### `src/vector/HybridSearch.ts`

Reciprocal Rank Fusion (RRF) merges FTS5 keyword results with vector results into a single ranked list.

```typescript
import { SearchResult, Node } from '../types.js';
import { VectorSearchResult } from './VectorIndex.js';

const RRF_K = 60; // Standard RRF constant

export interface HybridResult {
  node: Node;
  score: number;
  ftsRank?: number;
  vectorRank?: number;
}

export function reciprocalRankFusion(
  ftsResults: SearchResult[],          // existing CodeGraph SearchResult[]
  vectorResults: VectorSearchResult[], // from VectorIndex.search()
  nodes: Map<string, Node>,            // full node lookup
  ftsWeight = 1.0,
  vectorWeight = 1.0,
): HybridResult[] {
  const scores = new Map<string, { score: number; ftsRank?: number; vectorRank?: number }>();

  // FTS5 lane
  ftsResults.forEach((r, rank) => {
    const id = r.node.id;
    const rrf = ftsWeight / (RRF_K + rank + 1);
    scores.set(id, { score: rrf, ftsRank: rank + 1 });
  });

  // Vector lane
  vectorResults.forEach((r, rank) => {
    const id = r.nodeId;
    const rrf = vectorWeight / (RRF_K + rank + 1);
    const existing = scores.get(id);
    if (existing) {
      existing.score += rrf;
      existing.vectorRank = rank + 1;
    } else {
      scores.set(id, { score: rrf, vectorRank: rank + 1 });
    }
  });

  return Array.from(scores.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .flatMap(([id, meta]) => {
      const node = nodes.get(id);
      if (!node) return [];
      return [{ node, ...meta }];
    });
}
```

---

## Modified Modules

### `src/db/QueryBuilder.ts` — additions

Two new methods alongside existing queries. No existing queries change.

```typescript
// Add after existing node query methods:

async getNodesForVectorSync(since?: number): Promise<Node[]> {
  const cutoff = since ?? 0;
  return this.db.prepare(`
    SELECT n.*
    FROM nodes n
    LEFT JOIN vector_sync vs ON vs.node_id = n.id
    WHERE vs.node_id IS NULL
       OR n.updated_at > vs.embedded_at
       OR vs.content_hash IS NULL
    ORDER BY n.updated_at DESC
  `).all() as Node[];
}

async upsertVectorSync(nodeId: string, vectorId: string, hash: string): Promise<void> {
  this.db.prepare(`
    INSERT INTO vector_sync (node_id, vector_id, content_hash, embedded_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(node_id) DO UPDATE SET
      vector_id    = excluded.vector_id,
      content_hash = excluded.content_hash,
      embedded_at  = excluded.embedded_at
  `).run(nodeId, vectorId, hash, Date.now());
}

async getVectorSyncStats(): Promise<{ total: number; synced: number; pending: number }> {
  const total  = (this.db.prepare('SELECT COUNT(*) as c FROM nodes').get() as any).c;
  const synced = (this.db.prepare('SELECT COUNT(*) as c FROM vector_sync').get() as any).c;
  return { total, synced, pending: total - synced };
}
```

### `src/sync/SyncEngine.ts` — additions

After each incremental file sync completes, trigger a vector sync for changed nodes only:

```typescript
// Add to the post-sync callback:
private async syncVectorIndex(changedNodeIds: string[]): Promise<void> {
  if (!this.vectorIndex || !this.embedder) return;

  const nodes = await this.queryBuilder.getNodesByIds(changedNodeIds);
  const toEmbed = nodes.filter(n => {
    const doc  = buildEmbeddingDocument(n);
    const hash = contentHash(doc);
    return hash !== this.vectorSyncCache.get(n.id);
  });

  if (toEmbed.length === 0) return;

  const BATCH = 64;
  for (let i = 0; i < toEmbed.length; i += BATCH) {
    const batch = toEmbed.slice(i, i + BATCH);
    const docs   = batch.map(buildEmbeddingDocument);
    const vectors = await this.embedder.embedBatch(docs);

    await this.vectorIndex.upsertBatch(
      batch.map((node, j) => ({ node, vector: vectors[j] }))
    );

    for (let j = 0; j < batch.length; j++) {
      const hash = contentHash(docs[j]);
      await this.queryBuilder.upsertVectorSync(batch[j].id, batch[j].id, hash);
      this.vectorSyncCache.set(batch[j].id, hash);
    }
  }
}
```

### `src/context/index.ts` — hybrid path

Replace the `findRelevantContext` FTS5-only path with a hybrid path when vector index is available:

```typescript
async findRelevantContext(
  query: string,
  options?: FindContextOptions,
): Promise<Subgraph> {
  // Existing FTS5 path — always runs
  const ftsResults = await this.queryBuilder.searchNodes(query, {
    limit: options?.searchLimit ?? 30,
    kinds: options?.nodeKinds,
    languages: options?.languages,
  });

  // Vector path — runs when index is available
  let hybridNodes: Node[] = ftsResults.map(r => r.node);

  if (this.vectorIndex && this.embedder) {
    const queryVec = await this.embedder.embed(query);
    const vecResults = await this.vectorIndex.searchFiltered(queryVec, {
      kind: options?.nodeKinds,
      language: options?.languages,
    }, options?.searchLimit ?? 30);

    const nodeMap = new Map(ftsResults.map(r => [r.node.id, r.node]));

    // Hydrate any vector-only results from DB
    const vecOnlyIds = vecResults
      .filter(r => !nodeMap.has(r.nodeId))
      .map(r => r.nodeId);

    if (vecOnlyIds.length > 0) {
      const extra = await this.queryBuilder.getNodesByIds(vecOnlyIds);
      extra.forEach(n => nodeMap.set(n.id, n));
    }

    const fused = reciprocalRankFusion(ftsResults, vecResults, nodeMap);
    hybridNodes = fused
      .slice(0, options?.maxNodes ?? 20)
      .map(r => r.node);
  }

  // Existing graph expansion — unchanged
  return this.expandSubgraph(hybridNodes, options?.traversalDepth ?? 1, options?.edgeKinds);
}
```

---

## New MCP Tools

Add three new tools to `src/mcp/ToolHandler.ts`:

### `codegraph_semantic_search`

Pure semantic search — finds nodes by meaning, not keywords. Useful when the user doesn't know exact function/class names.

```typescript
{
  name: 'codegraph_semantic_search',
  description: 'Search code by meaning using semantic embeddings. Finds symbols that match the intent of a natural language query even with no keyword overlap.',
  inputSchema: {
    type: 'object',
    properties: {
      query:       { type: 'string',  description: 'Natural language description of what you are looking for' },
      kind:        { type: 'string',  description: 'Filter by node kind (function, class, method, etc.)' },
      language:    { type: 'string',  description: 'Filter by programming language' },
      limit:       { type: 'number',  description: 'Max results (default: 10)' },
      projectPath: { type: 'string',  description: 'Project root path' },
    },
    required: ['query'],
  },
}
```

### `codegraph_similar`

Given a symbol name, find semantically similar symbols — useful for dead code detection, duplication review, and API consistency checks.

```typescript
{
  name: 'codegraph_similar',
  description: 'Find symbols semantically similar to a given symbol. Useful for finding duplicate logic, equivalent implementations across modules, or related patterns.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol:      { type: 'string', description: 'Symbol name or qualified name to find similar nodes for' },
      limit:       { type: 'number', description: 'Max results (default: 10)' },
      projectPath: { type: 'string', description: 'Project root path' },
    },
    required: ['symbol'],
  },
}
```

**Implementation:** Fetch the target node, embed it, run kNN in RuVector, exclude the source node from results.

### `codegraph_cluster`

Returns module-level clusters derived from embedding space — surfaces hidden conceptual groupings that don't map cleanly to directory structure.

```typescript
{
  name: 'codegraph_cluster',
  description: 'Group symbols into semantic clusters based on their meaning and relationships. Surfaces conceptual modules that may not align with directory structure.',
  inputSchema: {
    type: 'object',
    properties: {
      kind:        { type: 'string', description: 'Focus on a specific node kind' },
      minCluster:  { type: 'number', description: 'Minimum symbols per cluster (default: 3)' },
      projectPath: { type: 'string', description: 'Project root path' },
    },
  },
}
```

---

## Configuration

Add to `codegraph.config.json` (or project metadata):

```json
{
  "vector": {
    "enabled": true,
    "model": "Xenova/all-MiniLM-L6-v2",
    "dimensions": 384,
    "storagePath": ".codegraph/vectors.db",
    "hnswM": 32,
    "efConstruction": 200,
    "efSearch": 100,
    "quantization": "scalar",
    "hybridWeights": {
      "fts": 1.0,
      "vector": 1.0
    },
    "batchSize": 64,
    "indexOnSync": true
  }
}
```

`vector.enabled = false` (default) means zero overhead — the existing FTS5 path runs exactly as before. Enabling it downloads the model on first use (~23MB) and builds the vector index incrementally.

---

## Implementation Phases

### Phase 1 — Foundation (Week 1)

- [ ] Add `vector_sync` table to SQLite schema migration
- [ ] Implement `src/vector/Embedder.ts` with `@xenova/transformers`
- [ ] Implement `src/vector/VectorIndex.ts` wrapping `@ruvector/node`
- [ ] Add `vector` section to config loader
- [ ] Wire `VectorIndex` and `Embedder` into `CodeGraphDatabase` (lazy init)
- [ ] Add `codegraph index --build-vectors` CLI flag for initial full index

### Phase 2 — Search Integration (Week 2)

- [ ] Implement `src/vector/HybridSearch.ts` (RRF fusion)
- [ ] Modify `ContextBuilder.findRelevantContext` to run hybrid path
- [ ] Modify `codegraph_search` MCP tool to use hybrid when available
- [ ] Add `codegraph_semantic_search` MCP tool
- [ ] Add `codegraph_similar` MCP tool
- [ ] Update `codegraph_status` to report vector sync state

### Phase 3 — Incremental Sync (Week 3)

- [ ] Hook `SyncEngine` post-file-change to call `syncVectorIndex(changedNodeIds)`
- [ ] Implement content-hash delta detection to skip unchanged nodes
- [ ] Add `codegraph_cluster` MCP tool
- [ ] Add vector stats to `codegraph_status` output

### Phase 4 — Tuning (Week 4)

- [ ] Benchmark hybrid vs FTS5-only on representative query sets
- [ ] Tune RRF weights (`ftsWeight`, `vectorWeight`) per query type
- [ ] Evaluate `nomic-embed-code` (768d) vs `all-MiniLM-L6-v2` (384d) on code corpora
- [ ] Add optional HNSW config overrides per project

---

## Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "@ruvector/node": "^0.1.19",
    "@xenova/transformers": "^2.17.0"
  }
}
```

`@ruvector/node` is a native NAPI module (Rust). Prebuilt binaries ship for Linux x64/arm64, macOS x64/arm64, Windows x64 — no Rust toolchain needed at install time.

`@xenova/transformers` runs ONNX models in Node.js via WebAssembly — no Python, no GPU required. CPU inference of MiniLM-L6-v2 takes ~2ms/embedding on modern hardware.

---

## Storage Estimates

| Corpus size | Vector DB size (scalar quantized) | SQLite (existing) |
|---|---|---|
| 10K nodes | ~15 MB | ~5 MB |
| 100K nodes | ~150 MB | ~50 MB |
| 500K nodes | ~750 MB | ~250 MB |

Scalar quantization (4× compression) keeps storage within reason for large monorepos. Product quantization (8×) is available if disk is a constraint — at a small accuracy cost.

---

## Query Flow Examples

### Example 1: "find user authentication middleware"

```
1. FTS5 → matches: "authenticateMiddleware", "authMiddleware", "auth" (keyword hits)
2. Vector → matches: "verifyToken", "checkSession", "requireLogin", "guardRoute" (semantic hits)
3. RRF fusion → unified ranked list
4. Graph expansion (depth=1) → adds callers/callees of top-ranked nodes
5. Context builder → Markdown output to Claude
```

### Example 2: "find functions similar to parseQueryString"

```
1. Exact node lookup → get Node for "parseQueryString"
2. Embed node document → Float32Array[384]
3. kNN search → top 10 cosine neighbors
4. Return: "deserializeParams", "decodeUrlParams", "extractQueryVars", ...
5. (No FTS5 needed — pure vector)
```

### Example 3: "what calls validateUser and what does it call?"

```
1. FTS5 / exact lookup → find "validateUser" node (keyword is known)
2. Graph traversal → callers + callees (existing codegraph_callers/callees)
3. (No vector needed — structural query)
```

Structural queries stay on the graph. Semantic queries go to RuVector. Both lanes fuse when the query is ambiguous.

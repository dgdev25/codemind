import { Node, NodeKind, Language } from '../types';

interface RuVectorDB {
  insert(entry: RuVectorEntry): Promise<string>;
  insertBatch(entries: RuVectorEntry[]): Promise<string[]>;
  search(query: { vector: Float32Array; k: number; efSearch?: number }): Promise<RuVectorHit[]>;
  delete(id: string): Promise<boolean>;
  len(): Promise<number>;
}

// tsc (CJS mode) rewrites import() to require(), which breaks ESM-only packages.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const importESM = new Function('s', 'return import(s)') as (s: string) => Promise<unknown>;

export interface VectorSearchResult {
  nodeId: string;
  score: number;
  kind: NodeKind;
  name: string;
  qualifiedName: string;
  filePath: string;
  language: Language;
}

interface RuVectorEntry {
  id: string;
  vector: Float32Array;
  metadata: string;
}

interface RuVectorHit {
  id: string;
  score: number;
  metadata?: string;
}

interface NodeMetadata {
  nodeId: string;
  kind: NodeKind;
  name: string;
  qualifiedName: string;
  filePath: string;
  language: Language;
}

const DIMENSIONS = 384;

function buildMetadata(node: Node): string {
  const meta: NodeMetadata = {
    nodeId: node.id,
    kind: node.kind,
    name: node.name,
    qualifiedName: node.qualifiedName,
    filePath: node.filePath,
    language: node.language,
  };
  return JSON.stringify(meta);
}

function hitToResult(hit: RuVectorHit): VectorSearchResult | null {
  if (!hit.metadata) return null;
  try {
    const meta = JSON.parse(hit.metadata) as NodeMetadata;
    return { ...meta, score: hit.score };
  } catch {
    return null;
  }
}

export class VectorIndex {
  private db: RuVectorDB | null = null;
  private readonly storagePath: string;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
  }

  async init(config: {
    hnswM?: number;
    efConstruction?: number;
    efSearch?: number;
    quantization?: string;
  } = {}): Promise<void> {
    if (this.db) return;
    const mod = await importESM('@ruvector/node') as { VectorDB: new (opts: object) => RuVectorDB };
    this.db = new mod.VectorDB({
      dimensions: DIMENSIONS,
      distanceMetric: 'Cosine',
      storagePath: this.storagePath,
      hnswConfig: {
        m: config.hnswM ?? 32,
        efConstruction: config.efConstruction ?? 200,
        efSearch: config.efSearch ?? 100,
        maxElements: 500_000,
      },
      quantization: { type: config.quantization ?? 'scalar' },
    });
  }

  private ready(): RuVectorDB {
    if (!this.db) throw new Error('VectorIndex.init() must be called before use');
    return this.db;
  }

  async upsert(node: Node, vector: Float32Array): Promise<string> {
    const entry: RuVectorEntry = { id: node.id, vector, metadata: buildMetadata(node) };
    return this.ready().insert(entry);
  }

  async upsertBatch(entries: Array<{ node: Node; vector: Float32Array }>): Promise<string[]> {
    const rows: RuVectorEntry[] = entries.map(({ node, vector }) => ({
      id: node.id,
      vector,
      metadata: buildMetadata(node),
    }));
    return this.ready().insertBatch(rows);
  }

  async search(queryVector: Float32Array, k = 20): Promise<VectorSearchResult[]> {
    const hits = await this.ready().search({ vector: queryVector, k, efSearch: 100 });
    return hits.flatMap((h) => {
      const r = hitToResult(h);
      return r ? [r] : [];
    });
  }

  async searchFiltered(
    queryVector: Float32Array,
    filter: { kind?: NodeKind[]; language?: Language[] },
    k = 20,
  ): Promise<VectorSearchResult[]> {
    // Over-fetch then post-filter — scalar quantization is fast enough locally.
    const candidates = await this.search(queryVector, k * 4);
    return candidates
      .filter((r) => {
        if (filter.kind?.length && !filter.kind.includes(r.kind)) return false;
        if (filter.language?.length && !filter.language.includes(r.language)) return false;
        return true;
      })
      .slice(0, k);
  }

  async remove(nodeId: string): Promise<void> {
    await this.ready().delete(nodeId);
  }

  async count(): Promise<number> {
    return this.ready().len();
  }
}

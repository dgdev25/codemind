import { createHash } from 'crypto';
import { Node } from '../types';

const MAX_EMBED_TEXT_LENGTH = 32_000;

type XenovaPipeline = (text: string, opts: { pooling: string; normalize: boolean }) => Promise<{ data: number[] }>;

// tsc (CJS mode) rewrites import() to require(), which breaks ESM-only packages.
// Using new Function bypasses that transformation at the cost of losing type inference.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const importESM = new Function('s', 'return import(s)') as (s: string) => Promise<unknown>;

export function buildEmbeddingDocument(node: Node): string {
  const parts: string[] = [`${node.kind}: ${node.qualifiedName}`];
  if (node.signature)              parts.push(node.signature);
  if (node.docstring)              parts.push(node.docstring);
  if (node.decorators?.length)     parts.push(node.decorators.join(' '));
  if (node.typeParameters?.length) parts.push(`<${node.typeParameters.join(', ')}>`);
  return parts.join('\n');
}

export function contentHash(doc: string): string {
  return createHash('sha256').update(doc).digest('hex').slice(0, 16);
}

export class Embedder {
  private pipeline: XenovaPipeline | null = null;

  async init(): Promise<void> {
    if (this.pipeline) return;
    // Dynamic import keeps startup cost zero for users who don't enable vector.
    const mod = await importESM('@xenova/transformers') as { pipeline: (task: string, model: string) => Promise<XenovaPipeline> };
    this.pipeline = await mod.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.pipeline) await this.init();
    const truncated = text.length > MAX_EMBED_TEXT_LENGTH ? text.slice(0, MAX_EMBED_TEXT_LENGTH) : text;
    const out = await this.pipeline!(truncated, { pooling: 'mean', normalize: true });
    return new Float32Array(out.data);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const results: Float32Array[] = [];
    for (const t of texts) {
      results.push(await this.embed(t));
    }
    return results;
  }
}

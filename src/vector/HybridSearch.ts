import type { SearchResult, Node } from '../types.js';
import type { VectorSearchResult } from './VectorIndex.js';

const RRF_K = 60;

export interface HybridResult {
  node: Node;
  score: number;
  ftsRank?: number;
  vectorRank?: number;
}

export function reciprocalRankFusion(
  ftsResults: SearchResult[],
  vectorResults: VectorSearchResult[],
  nodeMap: Map<string, Node>,
  ftsWeight = 1.0,
  vectorWeight = 1.0,
): HybridResult[] {
  const scores = new Map<string, { score: number; ftsRank?: number; vectorRank?: number }>();

  ftsResults.forEach((r, rank) => {
    scores.set(r.node.id, { score: ftsWeight / (RRF_K + rank + 1), ftsRank: rank + 1 });
  });

  vectorResults.forEach((r, rank) => {
    const rrf = vectorWeight / (RRF_K + rank + 1);
    const existing = scores.get(r.nodeId);
    if (existing) {
      existing.score += rrf;
      existing.vectorRank = rank + 1;
    } else {
      scores.set(r.nodeId, { score: rrf, vectorRank: rank + 1 });
    }
  });

  return Array.from(scores.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .flatMap(([id, meta]) => {
      const node = nodeMap.get(id);
      if (!node) return [];
      return [{ node, ...meta }];
    });
}

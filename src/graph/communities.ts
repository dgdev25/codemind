/**
 * Community Detection via Label Propagation
 *
 * Groups tightly connected symbols into communities using the label propagation
 * algorithm over call and import edges. Communities represent logical module
 * boundaries that emerge from actual code relationships.
 */

import { SqliteDatabase } from '../db/sqlite-adapter';

interface RawEdge { source: string; target: string; kind: string; }
interface RawNode { id: string; name: string; file_path: string; kind: string; }

const CLUSTER_EDGE_KINDS = ['calls', 'imports', 'extends', 'implements'];
const MAX_ITERATIONS = 15;
const MAX_NODES_FOR_CLUSTERING = 100_000;

/**
 * Run label propagation community detection and store results in node_communities.
 * Skips clustering for very large repos to keep indexing fast.
 */
export function computeAndStoreCommunities(db: SqliteDatabase): void {
  const nodeCount = (db.prepare('SELECT COUNT(*) as c FROM nodes').get() as { c: number }).c;

  // Skip clustering for very large repos
  if (nodeCount > MAX_NODES_FOR_CLUSTERING) return;

  // Load all meaningful nodes (skip import/export/file nodes — they add noise)
  const nodes = db.prepare(
    "SELECT id, name, file_path, kind FROM nodes WHERE kind NOT IN ('import', 'export', 'file')"
  ).all() as RawNode[];

  if (nodes.length === 0) return;

  // Load relevant edges
  const placeholders = CLUSTER_EDGE_KINDS.map(() => '?').join(',');
  const edges = db.prepare(
    `SELECT source, target, kind FROM edges WHERE kind IN (${placeholders})`
  ).all(...CLUSTER_EDGE_KINDS) as RawEdge[];

  // Build bidirectional adjacency for label propagation
  const neighbors = new Map<string, Set<string>>();
  for (const node of nodes) {
    neighbors.set(node.id, new Set());
  }
  for (const edge of edges) {
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  }

  // Initialize: each node is its own community
  const labels = new Map<string, string>();
  for (const node of nodes) {
    labels.set(node.id, node.id);
  }

  // Label propagation
  const nodeIds = nodes.map(n => n.id);
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let changed = false;

    // Fisher-Yates shuffle for convergence
    for (let i = nodeIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = nodeIds[i]!;
      nodeIds[i] = nodeIds[j]!;
      nodeIds[j] = tmp;
    }

    for (const nodeId of nodeIds) {
      const nbrs = neighbors.get(nodeId);
      if (!nbrs || nbrs.size === 0) continue;

      // Count label frequencies among neighbors
      const freq = new Map<string, number>();
      for (const nbr of nbrs) {
        const lbl = labels.get(nbr);
        if (lbl) freq.set(lbl, (freq.get(lbl) ?? 0) + 1);
      }

      // Pick most frequent label (tie-break: keep current)
      let maxCount = 0;
      let bestLabel = labels.get(nodeId)!;
      for (const [lbl, count] of freq) {
        if (count > maxCount) { maxCount = count; bestLabel = lbl; }
      }

      if (bestLabel !== labels.get(nodeId)) {
        labels.set(nodeId, bestLabel);
        changed = true;
      }
    }

    if (!changed) break;
  }

  // Group nodes by community label
  const communityNodes = new Map<string, RawNode[]>();
  for (const node of nodes) {
    const lbl = labels.get(node.id) ?? node.id;
    const existing = communityNodes.get(lbl) ?? [];
    existing.push(node);
    communityNodes.set(lbl, existing);
  }

  /**
   * Derive a human-readable name for a community from the most common
   * directory segment (excluding generic directories like src, lib, index).
   */
  function getCommunityName(memberNodes: RawNode[]): string {
    const segments = new Map<string, number>();
    for (const n of memberNodes) {
      const parts = n.file_path.split('/');
      for (let i = 1; i < parts.length - 1; i++) {
        const seg = parts[i]!;
        if (seg && seg !== 'src' && seg !== 'lib' && seg !== 'index') {
          segments.set(seg, (segments.get(seg) ?? 0) + 1);
        }
      }
    }
    if (segments.size > 0) {
      return [...segments.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    }
    // Fallback: name of the first member node
    return memberNodes[0]?.name ?? 'unknown';
  }

  // Store results in a transaction for atomicity
  db.prepare('DELETE FROM node_communities').run();
  const now = Date.now();
  const insert = db.prepare(
    'INSERT OR REPLACE INTO node_communities (node_id, community_id, community_name, computed_at) VALUES (?, ?, ?, ?)'
  );

  db.transaction(() => {
    for (const [communityId, members] of communityNodes) {
      const name = getCommunityName(members);
      for (const node of members) {
        insert.run(node.id, communityId, name, now);
      }
    }
  })();
}

/**
 * Execution Flow Analysis
 *
 * Precomputes call chains from entry points (routes, main, exported init functions)
 * and stores them in the execution_flows table for fast retrieval.
 */

import { QueryBuilder } from '../db/queries';
import { SqliteDatabase } from '../db/sqlite-adapter';
import { Node } from '../types';

export interface FlowStep {
  id: string;
  name: string;
  kind: string;
  filePath: string;
  line: number;
}

export interface ExecutionFlow {
  entryNodeId: string;
  entryName: string;
  steps: FlowStep[];
  depth: number;
}

const ENTRY_POINT_NAMES = new Set([
  'main', 'run', 'start', 'init', 'setup', 'bootstrap', 'configure',
  'handler', 'execute', 'process', 'handle', 'serve', 'listen',
]);

const MAX_FLOW_DEPTH = 6;
const MAX_ENTRY_POINTS = 500;
const MAX_STEPS_PER_FLOW = 50;

/**
 * Identify entry-point nodes from the graph.
 * Heuristics: route nodes, exported functions with entry-point names,
 * and any function with a recognized entry-point name.
 */
export function findEntryPoints(queries: QueryBuilder): Node[] {
  const results: Node[] = [];
  const seenIds = new Set<string>();

  const addIfNew = (node: Node): void => {
    if (!seenIds.has(node.id)) {
      seenIds.add(node.id);
      results.push(node);
    }
  };

  // Route nodes are always entry points
  try {
    const routes = queries.getNodesByKind('route' as Node['kind']);
    for (const node of routes) addIfNew(node);
  } catch {
    // Ignore if kind not supported
  }

  // Functions with entry point names (exported or not)
  for (const name of ENTRY_POINT_NAMES) {
    const nodes = queries.getNodesByName(name);
    for (const node of nodes) {
      if (['function', 'method'].includes(node.kind)) {
        addIfNew(node);
      }
    }
  }

  return results.slice(0, MAX_ENTRY_POINTS);
}

/**
 * Build a BFS call chain starting from nodeId.
 * Returns an ordered array of FlowSteps (entry first).
 */
export function computeCallChain(
  nodeId: string,
  queries: QueryBuilder,
): FlowStep[] {
  const steps: FlowStep[] = [];
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];

  while (queue.length > 0 && steps.length < MAX_STEPS_PER_FLOW) {
    const item = queue.shift()!;
    if (visited.has(item.id) || item.depth > MAX_FLOW_DEPTH) continue;
    visited.add(item.id);

    const node = queries.getNodeById(item.id);
    if (!node) continue;

    steps.push({
      id: node.id,
      name: node.name,
      kind: node.kind,
      filePath: node.filePath,
      line: node.startLine,
    });

    const outgoing = queries.getOutgoingEdges(item.id, ['calls' as import('../types').EdgeKind]);
    for (const edge of outgoing) {
      if (!visited.has(edge.target)) {
        queue.push({ id: edge.target, depth: item.depth + 1 });
      }
    }
  }

  return steps;
}

/**
 * Compute execution flows for all entry points and store them in the DB.
 * Clears existing flows first (full recompute on every index).
 */
export function computeAndStoreFlows(queries: QueryBuilder, db: SqliteDatabase): void {
  // Clear old flows
  db.prepare('DELETE FROM execution_flows').run();

  const entryPoints = findEntryPoints(queries);
  const now = Date.now();

  const insert = db.prepare(
    'INSERT INTO execution_flows (entry_node_id, flow_json, depth, node_count, computed_at) VALUES (?, ?, ?, ?, ?)'
  );

  for (const entry of entryPoints) {
    const steps = computeCallChain(entry.id, queries);
    if (steps.length === 0) continue;

    const depth = Math.max(0, steps.length - 1);

    insert.run(
      entry.id,
      JSON.stringify(steps),
      depth,
      steps.length,
      now,
    );
  }
}

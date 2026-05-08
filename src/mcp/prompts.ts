/**
 * MCP Prompt Definitions
 *
 * Reusable prompt templates surfaced via prompts/list and prompts/get.
 * These are pure graph-derived workflows — no LLM required to generate them.
 */

export interface McpPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
}

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: { type: 'text'; text: string };
}

export const prompts: McpPrompt[] = [
  {
    name: 'detect_impact',
    description: 'Pre-commit impact analysis — understand what your recent changes affect before committing.',
    arguments: [
      { name: 'base', description: 'Git ref to compare against (default: HEAD)', required: false },
    ],
  },
  {
    name: 'generate_map',
    description: 'Generate an architecture overview of this codebase — entry points, module communities, and key relationships.',
    arguments: [],
  },
  {
    name: 'explain_flow',
    description: 'Trace the execution flow from an entry point through the codebase.',
    arguments: [
      { name: 'entry', description: 'Entry point symbol name (e.g., "main", a route name, or exported function)', required: true },
    ],
  },
];

/**
 * Generate prompt messages for a given prompt name and arguments.
 * Returns null if the prompt name is not recognised.
 */
export function getPromptMessages(name: string, args: Record<string, string>): PromptMessage[] | null {
  switch (name) {
    case 'detect_impact': {
      const base = args.base || 'HEAD';
      return [{
        role: 'user',
        content: {
          type: 'text',
          text: `Use codemind_detect_changes with base="${base}" to see what symbols changed. Then use codemind_impact on the most critical changed symbols (focus on exported functions and route handlers). Summarise:\n1. What changed (files + symbols)\n2. Direct callers that will break (depth 1)\n3. Downstream risk (depth 2+)\n4. Recommended test files to run`,
        },
      }];
    }
    case 'generate_map': {
      return [{
        role: 'user',
        content: {
          type: 'text',
          text: `Generate a concise architecture map of this codebase. Steps:\n1. Call codemind_status to get project scale\n2. Call codemind_clusters to identify module communities\n3. Call codemind_flows to see the main entry points and their execution paths\n4. Call codemind_files with format="grouped" to see file distribution\n\nThen produce:\n- A 2-3 sentence summary of what this project does\n- A bullet list of the main modules/communities and their purpose\n- A Mermaid diagram showing the top-level call flow between entry points and communities\n- The 5 most important files to read to understand this codebase`,
        },
      }];
    }
    case 'explain_flow': {
      const entry = args.entry || 'main';
      return [{
        role: 'user',
        content: {
          type: 'text',
          text: `Trace the execution flow starting from "${entry}".\n1. Use codemind_flows with symbol="${entry}" to get the precomputed call chain\n2. Use codemind_callees on "${entry}" to get immediate callees\n3. For each callee that looks significant, use codemind_node with includeCode=true\n\nThen explain step-by-step how execution flows from ${entry} through the codebase, including what each major function does and what data it passes to the next.`,
        },
      }];
    }
    default:
      return null;
  }
}

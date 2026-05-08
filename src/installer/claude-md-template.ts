/**
 * CLAUDE.md template for CodeMind instructions
 *
 * This template is injected into ~/.claude/CLAUDE.md (global) or ./.claude/CLAUDE.md (local)
 * Keep this in sync with the README.md "Recommended: Add Global Instructions" section
 */

// Markers to identify CodeMind section for updates
export const CODEMIND_SECTION_START = '<!-- CODEMIND_START -->';
export const CODEMIND_SECTION_END = '<!-- CODEMIND_END -->';

export const CLAUDE_MD_TEMPLATE = `${CODEMIND_SECTION_START}
## CodeMind

CodeMind builds a semantic knowledge graph of codebases for faster, smarter code exploration.

### If \`.codemind/\` exists in the project

**NEVER call \`codemind_explore\` or \`codemind_context\` directly in the main session.** These tools return large amounts of source code that fills up main session context. Instead, ALWAYS spawn an Explore agent for any exploration question (e.g., "how does X work?", "explain the Y system", "where is Z implemented?").

**When spawning Explore agents**, include this instruction in the prompt:

> This project has CodeMind initialized (.codemind/ exists). Use \`codemind_explore\` as your PRIMARY tool — it returns full source code sections from all relevant files in one call.
>
> **Rules:**
> 1. Follow the explore call budget in the \`codemind_explore\` tool description — it scales automatically based on project size.
> 2. Do NOT re-read files that codemind_explore already returned source code for. The source sections are complete and authoritative.
> 3. Only fall back to grep/glob/read for files listed under "Additional relevant files" if you need more detail, or if codemind returned no results.

**The main session may only use these lightweight tools directly** (for targeted lookups before making edits, not for exploration):

| Tool | Use For |
|------|---------|
| \`codemind_search\` | Find symbols by name |
| \`codemind_callers\` / \`codemind_callees\` | Trace call flow |
| \`codemind_impact\` | Check what's affected before editing |
| \`codemind_node\` | Get a single symbol's details |

### If \`.codemind/\` does NOT exist

At the start of a session, ask the user if they'd like to initialize CodeMind:

"I notice this project doesn't have CodeMind initialized. Would you like me to run \`codemind init -i\` to build a code knowledge graph?"
${CODEMIND_SECTION_END}`;

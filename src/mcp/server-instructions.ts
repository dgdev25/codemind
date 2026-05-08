/**
 * Server-level instructions emitted in the MCP `initialize` response.
 *
 * MCP clients (Claude Code, Cursor, opencode, LangChain, OpenAI Agent
 * SDK, …) surface this text in the agent's system prompt automatically,
 * giving the agent a high-level playbook for the codemind toolset
 * before it sees individual tool descriptions.
 *
 * Goals when editing this:
 *   - Tool selection by intent (which tool for which question)
 *   - Common chains (refactor planning = X then Y)
 *   - Anti-patterns (don't grep when codemind_search is faster)
 *
 * Keep it tight. The agent reads this every session — long instructions
 * burn tokens. Reference only tools that exist on `main`; gate any
 * conditional tools behind feature checks if/when they ship.
 */
export const SERVER_INSTRUCTIONS = `# Codemind — code intelligence over an indexed knowledge graph

Codemind is a SQLite knowledge graph of every symbol, edge, and file
in the workspace. Reads are sub-millisecond; the index lags writes by
about a second through the file watcher. Consult it BEFORE writing or
editing code, not during.

## Tool selection by intent

- **"What is the symbol named X?"** → \`codemind_search\`
- **"What's the deal with this task / feature / area?"** → \`codemind_context\` (PRIMARY — composes search + node + callers + callees in one call)
- **"What calls this?"** → \`codemind_callers\`
- **"What does this call?"** → \`codemind_callees\`
- **"What would changing this break?"** → \`codemind_impact\`
- **"Show me this symbol's source / signature / docstring."** → \`codemind_node\`
- **"Survey an unfamiliar topic / pattern / module."** → \`codemind_explore\` (heavier; deep dive)
- **"What's in directory X?"** → \`codemind_files\`
- **"Is the index ready / what's its size?"** → \`codemind_status\`

## Common chains

- **Onboarding**: \`codemind_context\` first. If still unclear, \`codemind_explore\` for breadth, then \`codemind_node\` on specific symbols.
- **Refactor planning**: \`codemind_search\` → \`codemind_callers\` → \`codemind_impact\`. The blast-radius answer comes from impact, not from walking callers manually.
- **Debugging a regression**: \`codemind_callers\` of the suspected symbol; widen with \`codemind_impact\` if an unexpected call appears.

## Anti-patterns

- **Don't grep first** when looking up a symbol by name — \`codemind_search\` is faster and returns kind + location + signature.
- **Don't chain \`codemind_search\` + \`codemind_node\`** when you just want context — \`codemind_context\` is one round-trip.
- **Don't use \`codemind_explore\` for narrow questions** — it's a multi-call deep dive, expensive in tokens. Save it for genuine "I'm new here" surveys.
- **Don't query the index immediately after editing a file** — the watcher needs ~500ms to debounce + sync. Wait for the next turn.

## Limitations

- Index lags file writes by ~1 second.
- Cross-file resolution is best-effort name matching; ambiguous calls may return multiple candidates.
- No live correctness validation — that's still the TypeScript compiler / test suite / linter's job. Codegraph supplements those with structural context they don't have.
`;

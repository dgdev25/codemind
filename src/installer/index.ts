/**
 * CodeMind Interactive Installer
 *
 * Uses @clack/prompts for a polished interactive CLI experience.
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  writeMcpConfig, writeCursorMcpConfig, writeWindsurfMcpConfig,
  writePermissions, writeClaudeMd,
  hasMcpConfig, hasPermissions,
} from './config-writer';
import { installPostEditHook } from './hooks';

import type { InstallLocation, SupportedEditor } from './config-writer';

// Dynamic import helper — tsc compiles import() to require() in CJS mode,
// which fails for ESM-only packages. Specifier is validated against an allowlist.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const _dynamicImport = new Function('specifier', 'return import(specifier)') as
  (specifier: string) => Promise<unknown>;
const INSTALLER_ESM_ALLOWLIST = new Set(['@clack/prompts']);
const importESM = (specifier: string): Promise<typeof import('@clack/prompts')> => {
  if (!INSTALLER_ESM_ALLOWLIST.has(specifier)) throw new Error(`Blocked ESM import: ${specifier}`);
  return _dynamicImport(specifier) as Promise<typeof import('@clack/prompts')>;
};

/**
 * Format a number with commas
 */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Get the package version
 */
function getVersion(): string {
  try {
    const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch {
    return '0.0.0';
  }
}

/**
 * Run the interactive installer
 */
export async function runInstaller(): Promise<void> {
  const clack = await importESM('@clack/prompts');

  clack.intro(`CodeMind v${getVersion()}`);

  // Step 1: Select which editors to configure
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const multiselectFn = (clack as any).multiselect as (opts: {
    message: string;
    options: Array<{ value: string; label: string; hint?: string; selected?: boolean }>;
    required?: boolean;
  }) => Promise<string[] | symbol>;

  const editors = await multiselectFn({
    message: 'Which editors would you like to configure CodeMind for?',
    options: [
      { value: 'claude', label: 'Claude Code', hint: '~/.claude.json', selected: true },
      { value: 'cursor', label: 'Cursor', hint: '~/.cursor/mcp.json' },
      { value: 'windsurf', label: 'Windsurf', hint: '~/.codeium/windsurf/mcp_config.json' },
    ],
    required: true,
  });

  if (clack.isCancel(editors)) {
    clack.cancel('Installation cancelled.');
    process.exit(0);
  }

  // Step 2: Installation location
  const location = await clack.select({
    message: 'Where would you like to install?',
    options: [
      { value: 'global' as const, label: 'Global', hint: '~/.claude — available in all projects' },
      { value: 'local' as const, label: 'Local', hint: './.claude — this project only' },
    ],
    initialValue: 'global' as const,
  });

  if (clack.isCancel(location)) {
    clack.cancel('Installation cancelled.');
    process.exit(0);
  }

  // Step 3: Auto-allow permissions
  const autoAllow = await clack.confirm({
    message: 'Auto-allow CodeMind commands? (Skips permission prompts)',
    initialValue: true,
  });

  if (clack.isCancel(autoAllow)) {
    clack.cancel('Installation cancelled.');
    process.exit(0);
  }

  // Step 4: Write configuration files
  writeConfigs(clack, location, autoAllow, editors as SupportedEditor[]);

  // Step 5: For local install, initialize the project
  if (location === 'local') {
    await initializeLocalProject(clack);
  }

  // Done
  if (location === 'global') {
    clack.note(
      'cd your-project\ncodemind init -i',
      'Quick start',
    );
  }

  const selectedEditors = editors as SupportedEditor[];
  const restartLines: string[] = [];
  if (selectedEditors.includes('claude')) restartLines.push('Restart Claude Code to activate CodeMind');
  if (selectedEditors.includes('cursor')) restartLines.push('Restart Cursor to activate CodeMind');
  if (selectedEditors.includes('windsurf')) restartLines.push('Restart Windsurf to activate CodeMind');

  clack.outro(restartLines.join('\n') || 'Done!');
}

/**
 * Write all configuration files and log results
 */
function writeConfigs(
  clack: typeof import('@clack/prompts'),
  location: InstallLocation,
  autoAllow: boolean,
  editors: SupportedEditor[],
): void {
  const locationLabel = location === 'global' ? '~/.claude' : './.claude';

  // MCP config for Claude Code
  if (editors.includes('claude')) {
    const mcpAction = hasMcpConfig(location) ? 'Updated' : 'Added';
    writeMcpConfig(location);
    clack.log.success(`${mcpAction} MCP server in ${locationLabel}.json`);

    // PostEdit auto-sync hook
    const hookResult = installPostEditHook(location as 'global' | 'local');
    if (hookResult.created) {
      clack.log.success('Added PostEdit auto-sync hook (graph updates after file edits)');
    }
  }

  // MCP config for Cursor
  if (editors.includes('cursor')) {
    writeCursorMcpConfig();
    clack.log.success('Added MCP server in ~/.cursor/mcp.json');
  }

  // MCP config for Windsurf
  if (editors.includes('windsurf')) {
    writeWindsurfMcpConfig();
    clack.log.success('Added MCP server in ~/.codeium/windsurf/mcp_config.json');
  }

  // Permissions (Claude Code only)
  if (editors.includes('claude') && autoAllow) {
    const permAction = hasPermissions(location) ? 'Updated' : 'Added';
    writePermissions(location);
    clack.log.success(`${permAction} permissions in ${locationLabel}/settings.json`);
  }

  // CLAUDE.md (Claude Code only)
  if (editors.includes('claude')) {
    const claudeMdResult = writeClaudeMd(location);
    const claudeMdPath = `${locationLabel}/CLAUDE.md`;
    if (claudeMdResult.created) {
      clack.log.success(`Created ${claudeMdPath}`);
    } else if (claudeMdResult.updated) {
      clack.log.success(`Updated ${claudeMdPath}`);
    } else {
      clack.log.success(`Added CodeMind instructions to ${claudeMdPath}`);
    }
  }
}

/**
 * Initialize CodeMind in the current project (for local installs)
 */
async function initializeLocalProject(clack: typeof import('@clack/prompts')): Promise<void> {
  const projectPath = process.cwd();

  // Lazy-load CodeMind (requires native modules)
  let CodeMind: typeof import('../index').default;
  try {
    CodeMind = (await import('../index')).default;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    clack.log.error(`Could not load native modules: ${msg}`);
    clack.log.info('Skipping project initialization. Run "codemind init -i" later.');
    return;
  }

  // Check if already initialized
  if (CodeMind.isInitialized(projectPath)) {
    clack.log.info('CodeMind already initialized in this project');
    return;
  }

  // Initialize
  const cg = await CodeMind.init(projectPath);
  clack.log.success('Created .codemind/ directory');

  // Index the project with shimmer progress (worker thread for smooth animation)
  const { createShimmerProgress } = await import('../ui/shimmer-progress');
  process.stdout.write(`\x1b[2m│\x1b[0m\n`);
  const progress = createShimmerProgress();

  const result = await cg.indexAll({
    onProgress: progress.onProgress,
  });

  await progress.stop();

  if (result.filesErrored > 0) {
    clack.log.success(`Indexed ${formatNumber(result.filesIndexed)} files (${formatNumber(result.filesErrored)} failed, ${formatNumber(result.nodesCreated)} symbols)`);
  } else {
    clack.log.success(`Indexed ${formatNumber(result.filesIndexed)} files (${formatNumber(result.nodesCreated)} symbols)`);
  }

  cg.close();
}

// Re-export for CLI
export type { InstallLocation, SupportedEditor };

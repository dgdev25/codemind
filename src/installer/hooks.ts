/**
 * PostEdit auto-sync hook management for Claude Code settings
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type HookInstallLocation = 'global' | 'local';

function getSettingsPath(location: HookInstallLocation): string {
  const dir = location === 'global'
    ? path.join(os.homedir(), '.claude')
    : path.join(process.cwd(), '.claude');
  return path.join(dir, 'settings.json');
}

function readJson(p: string): Record<string, unknown> {
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>; } catch { return {}; }
}

function writeJson(p: string, data: Record<string, unknown>): void {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = p + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

const HOOK_MATCHER = 'Write|Edit|MultiEdit|NotebookEdit';
const HOOK_COMMAND = 'codemind sync --quiet 2>/dev/null || true';

export function installPostEditHook(location: HookInstallLocation): { created: boolean } {
  const settingsPath = getSettingsPath(location);
  const settings = readJson(settingsPath);

  if (!settings.hooks) settings.hooks = {};
  const hooks = settings.hooks as Record<string, unknown[]>;

  if (!Array.isArray(hooks.PostToolUse)) hooks.PostToolUse = [];

  // Check if already installed
  const existing = hooks.PostToolUse.find(
    (h: unknown) => (h as Record<string, unknown>).matcher === HOOK_MATCHER
  );
  if (existing) return { created: false };

  hooks.PostToolUse.push({
    matcher: HOOK_MATCHER,
    hooks: [{ type: 'command', command: HOOK_COMMAND }],
  });

  writeJson(settingsPath, settings);
  return { created: true };
}

export function hasPostEditHook(location: HookInstallLocation): boolean {
  const settingsPath = getSettingsPath(location);
  const settings = readJson(settingsPath);
  const postToolUse = (settings.hooks as Record<string, unknown[]> | undefined)?.PostToolUse;
  if (!Array.isArray(postToolUse)) return false;
  return postToolUse.some(
    (h: unknown) => (h as Record<string, unknown>).matcher === HOOK_MATCHER
  );
}

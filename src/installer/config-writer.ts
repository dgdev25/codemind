/**
 * Config file writing for the CodeMind installer
 * Writes to claude.json, settings.json, and CLAUDE.md
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
export type InstallLocation = 'global' | 'local';
export type SupportedEditor = 'claude' | 'cursor' | 'windsurf';
import {
  CLAUDE_MD_TEMPLATE,
  CODEMIND_SECTION_START,
  CODEMIND_SECTION_END,
} from './claude-md-template';

/**
 * Get the path to the Claude config directory
 */
function getClaudeConfigDir(location: InstallLocation): string {
  if (location === 'global') {
    return path.join(os.homedir(), '.claude');
  }
  return path.join(process.cwd(), '.claude');
}

/**
 * Get the path to the claude.json file
 * - Global: ~/.claude.json (root level)
 * - Local: ./.claude.json (project root)
 */
function getClaudeJsonPath(location: InstallLocation): string {
  if (location === 'global') {
    return path.join(os.homedir(), '.claude.json');
  }
  return path.join(process.cwd(), '.claude.json');
}

/**
 * Get the path to the settings.json file
 * - Global: ~/.claude/settings.json
 * - Local: ./.claude/settings.json
 */
function getSettingsJsonPath(location: InstallLocation): string {
  const configDir = getClaudeConfigDir(location);
  return path.join(configDir, 'settings.json');
}

/**
 * Read a JSON file, returning an empty object if it doesn't exist.
 * Distinguishes between missing files (returns {}) and corrupted
 * files (logs warning, returns {}).
 */
function readJsonFile(filePath: string): Record<string, any> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  Warning: Could not parse ${path.basename(filePath)}: ${msg}`);
    console.warn(`  A backup will be created before overwriting.`);
    // Create a backup of the corrupted file
    try {
      const backupPath = filePath + '.backup';
      fs.copyFileSync(filePath, backupPath);
    } catch { /* ignore backup failure */ }
    return {};
  }
}

/**
 * Write a file atomically by writing to a temp file then renaming.
 * Prevents corruption if the process crashes mid-write.
 */
function atomicWriteFileSync(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = filePath + '.tmp.' + process.pid;
  try {
    fs.writeFileSync(tmpPath, content);
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    // Clean up temp file on failure
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

/**
 * Write a JSON file, creating parent directories if needed
 */
function writeJsonFile(filePath: string, data: Record<string, any>): void {
  atomicWriteFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Get the MCP server configuration
 */
function getMcpServerConfig(): Record<string, any> {
  return {
    type: 'stdio',
    command: 'codemind',
    args: ['serve', '--mcp'],
  };
}

/**
 * Write the MCP server configuration to claude.json
 */
export function writeMcpConfig(location: InstallLocation): void {
  const claudeJsonPath = getClaudeJsonPath(location);
  const config = readJsonFile(claudeJsonPath);

  // Ensure mcpServers object exists
  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  // Add or update codemind server
  config.mcpServers.codemind = getMcpServerConfig();

  writeJsonFile(claudeJsonPath, config);
}

/**
 * Get the list of permissions for CodeMind tools
 */
function getCodeMindPermissions(): string[] {
  return [
    'mcp__codemind__codemind_search',
    'mcp__codemind__codemind_context',
    'mcp__codemind__codemind_callers',
    'mcp__codemind__codemind_callees',
    'mcp__codemind__codemind_impact',
    'mcp__codemind__codemind_node',
    'mcp__codemind__codemind_status',
  ];
}

/**
 * Write permissions to settings.json
 */
export function writePermissions(location: InstallLocation): void {
  const settingsPath = getSettingsJsonPath(location);
  const settings = readJsonFile(settingsPath);

  // Ensure permissions object exists
  if (!settings.permissions) {
    settings.permissions = {};
  }

  // Ensure allow array exists
  if (!Array.isArray(settings.permissions.allow)) {
    settings.permissions.allow = [];
  }

  // Add CodeMind permissions (avoiding duplicates)
  const codemindPermissions = getCodeMindPermissions();
  for (const permission of codemindPermissions) {
    if (!settings.permissions.allow.includes(permission)) {
      settings.permissions.allow.push(permission);
    }
  }

  writeJsonFile(settingsPath, settings);
}

/**
 * Write the MCP server configuration to ~/.cursor/mcp.json
 */
export function writeCursorMcpConfig(): void {
  const cursorPath = path.join(os.homedir(), '.cursor', 'mcp.json');
  const config = readJsonFile(cursorPath);
  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers.codemind = getMcpServerConfig();
  writeJsonFile(cursorPath, config);
}

/**
 * Write the MCP server configuration to ~/.codeium/windsurf/mcp_config.json
 */
export function writeWindsurfMcpConfig(): void {
  const windsurfPath = path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json');
  const config = readJsonFile(windsurfPath);
  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers.codemind = getMcpServerConfig();
  writeJsonFile(windsurfPath, config);
}

/**
 * Check if MCP config already exists for CodeMind
 */
export function hasMcpConfig(location: InstallLocation): boolean {
  const claudeJsonPath = getClaudeJsonPath(location);
  const config = readJsonFile(claudeJsonPath);
  return !!config.mcpServers?.codemind;
}

/**
 * Check if permissions already exist for CodeMind
 */
export function hasPermissions(location: InstallLocation): boolean {
  const settingsPath = getSettingsJsonPath(location);
  const settings = readJsonFile(settingsPath);
  const permissions = settings.permissions?.allow;
  if (!Array.isArray(permissions)) {
    return false;
  }
  // Check if at least one CodeMind permission exists
  return permissions.some((p: string) => p.startsWith('mcp__codemind__'));
}

/**
 * Get the path to CLAUDE.md
 * - Global: ~/.claude/CLAUDE.md
 * - Local: ./.claude/CLAUDE.md
 */
function getClaudeMdPath(location: InstallLocation): string {
  const configDir = getClaudeConfigDir(location);
  return path.join(configDir, 'CLAUDE.md');
}

/**
 * Check if CLAUDE.md has CodeMind section
 */
export function hasClaudeMdSection(location: InstallLocation): boolean {
  const claudeMdPath = getClaudeMdPath(location);
  try {
    if (fs.existsSync(claudeMdPath)) {
      const content = fs.readFileSync(claudeMdPath, 'utf-8');
      return content.includes(CODEMIND_SECTION_START) || content.includes('## CodeMind');
    }
  } catch {
    // Ignore errors
  }
  return false;
}

/**
 * Write or update CLAUDE.md with CodeMind instructions
 *
 * If the file exists and has a CodeMind section (marked or unmarked),
 * it will be replaced. Otherwise, the template is appended.
 */
export function writeClaudeMd(location: InstallLocation): { created: boolean; updated: boolean } {
  const claudeMdPath = getClaudeMdPath(location);
  const configDir = getClaudeConfigDir(location);

  // Ensure directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Check if file exists
  if (!fs.existsSync(claudeMdPath)) {
    // Create new file with just the CodeMind section
    atomicWriteFileSync(claudeMdPath, CLAUDE_MD_TEMPLATE + '\n');
    return { created: true, updated: false };
  }

  // Read existing content
  let content = fs.readFileSync(claudeMdPath, 'utf-8');

  // Check for marked section (from previous installer)
  if (content.includes(CODEMIND_SECTION_START)) {
    // Replace the marked section
    const startIdx = content.indexOf(CODEMIND_SECTION_START);
    const endIdx = content.indexOf(CODEMIND_SECTION_END);

    if (endIdx > startIdx) {
      // Replace existing marked section
      const before = content.substring(0, startIdx);
      const after = content.substring(endIdx + CODEMIND_SECTION_END.length);
      content = before + CLAUDE_MD_TEMPLATE + after;
      atomicWriteFileSync(claudeMdPath, content);
      return { created: false, updated: true };
    }
  }

  // Check for unmarked "## CodeMind" section (from manual setup)
  const codemindHeaderRegex = /\n## CodeMind\n/;
  const match = content.match(codemindHeaderRegex);

  if (match && match.index !== undefined) {
    // Find the end of the CodeMind section (next h2 header or end of file)
    // Use negative lookahead (?!#) to match "## X" but not "### X"
    const sectionStart = match.index;
    const afterSection = content.substring(sectionStart + 1);
    const nextHeaderMatch = afterSection.match(/\n## (?!#)/);

    let sectionEnd: number;
    if (nextHeaderMatch && nextHeaderMatch.index !== undefined) {
      sectionEnd = sectionStart + 1 + nextHeaderMatch.index;
    } else {
      sectionEnd = content.length;
    }

    // Replace the section
    const before = content.substring(0, sectionStart);
    const after = content.substring(sectionEnd);
    content = before + '\n' + CLAUDE_MD_TEMPLATE + after;
    atomicWriteFileSync(claudeMdPath, content);
    return { created: false, updated: true };
  }

  // No existing section, append to end
  content = content.trimEnd() + '\n\n' + CLAUDE_MD_TEMPLATE + '\n';
  atomicWriteFileSync(claudeMdPath, content);
  return { created: false, updated: false };
}

#!/usr/bin/env node
/**
 * CodeMind preuninstall cleanup script
 *
 * Runs automatically when `npm uninstall -g @colbymchenry/codemind` is called.
 * Removes all CodeMind configuration from Claude Code:
 *   - MCP server entry from ~/.claude.json
 *   - Permissions from ~/.claude/settings.json
 *   - CodeMind section from ~/.claude/CLAUDE.md
 *
 * This script must never throw — a failed cleanup must not block uninstall.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CODEMIND_SECTION_START = '<!-- CODEMIND_START -->';
const CODEMIND_SECTION_END = '<!-- CODEMIND_END -->';

function readJson(filePath: string): Record<string, any> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeJson(filePath: string, data: Record<string, any>): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Remove CodeMind MCP server from ~/.claude.json
 */
function removeMcpConfig(): void {
  const filePath = path.join(os.homedir(), '.claude.json');
  const config = readJson(filePath);
  if (!config?.mcpServers?.codemind) return;

  delete config.mcpServers.codemind;

  // Clean up empty mcpServers object
  if (Object.keys(config.mcpServers).length === 0) {
    delete config.mcpServers;
  }

  writeJson(filePath, config);
}

/**
 * Remove CodeMind permissions from ~/.claude/settings.json
 */
function removeSettings(): void {
  const filePath = path.join(os.homedir(), '.claude', 'settings.json');
  const settings = readJson(filePath);
  if (!settings) return;

  // Remove codemind permissions
  if (Array.isArray(settings.permissions?.allow)) {
    const before = settings.permissions.allow.length;
    settings.permissions.allow = settings.permissions.allow.filter(
      (p: string) => !p.startsWith('mcp__codemind__')
    );
    if (settings.permissions.allow.length === before) return;

    // Clean up empty allow array
    if (settings.permissions.allow.length === 0) {
      delete settings.permissions.allow;
    }
    // Clean up empty permissions object
    if (Object.keys(settings.permissions).length === 0) {
      delete settings.permissions;
    }

    writeJson(filePath, settings);
  }
}

/**
 * Remove CodeMind section from ~/.claude/CLAUDE.md
 */
function removeClaudeMd(): void {
  const filePath = path.join(os.homedir(), '.claude', 'CLAUDE.md');
  try {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf-8');

    // Remove marked section
    const startIdx = content.indexOf(CODEMIND_SECTION_START);
    const endIdx = content.indexOf(CODEMIND_SECTION_END);

    if (startIdx !== -1 && endIdx > startIdx) {
      const before = content.substring(0, startIdx).trimEnd();
      const after = content.substring(endIdx + CODEMIND_SECTION_END.length).trimStart();
      content = before + (before && after ? '\n\n' : '') + after;

      if (content.trim() === '') {
        // File is empty after removing section — delete it
        fs.unlinkSync(filePath);
      } else {
        fs.writeFileSync(filePath, content.trim() + '\n');
      }
    }
  } catch {
    // Never fail
  }
}

// Run cleanup — never throw
try {
  removeMcpConfig();
} catch { /* ignore */ }

try {
  removeSettings();
} catch { /* ignore */ }

try {
  removeClaudeMd();
} catch { /* ignore */ }

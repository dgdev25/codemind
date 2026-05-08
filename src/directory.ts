/**
 * Directory Management
 *
 * Manages the .codemind/ directory structure for CodeMind data.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * CodeMind directory name
 */
export const CODEMIND_DIR = '.codemind';

/**
 * Get the .codemind directory path for a project
 */
export function getCodeMindDir(projectRoot: string): string {
  return path.join(projectRoot, CODEMIND_DIR);
}

/**
 * Check if a project has been initialized with CodeMind
 * Requires both .codemind/ directory AND codemind.db to exist
 */
export function isInitialized(projectRoot: string): boolean {
  const codemindDir = getCodeMindDir(projectRoot);
  if (!fs.existsSync(codemindDir) || !fs.statSync(codemindDir).isDirectory()) {
    return false;
  }
  // Must have codemind.db, not just .codemind folder
  const dbPath = path.join(codemindDir, 'codemind.db');
  return fs.existsSync(dbPath);
}

/**
 * Find the nearest parent directory containing .codemind/
 *
 * Walks up from the given path to find a CodeMind-initialized project,
 * similar to how git finds .git/ directories.
 *
 * @param startPath - Directory to start searching from
 * @returns The project root containing .codemind/, or null if not found
 */
export function findNearestCodeMindRoot(startPath: string): string | null {
  let current = path.resolve(startPath);
  const root = path.parse(current).root;

  while (current !== root) {
    if (isInitialized(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break; // Reached filesystem root
    current = parent;
  }

  // Check root as well
  if (isInitialized(current)) {
    return current;
  }

  return null;
}

/**
 * Create the .codemind directory structure
 * Note: Only throws if codemind.db already exists, not just if .codemind/ exists.
 */
export function createDirectory(projectRoot: string): void {
  const codemindDir = getCodeMindDir(projectRoot);
  const dbPath = path.join(codemindDir, 'codemind.db');

  // Only throw if CodeMind is actually initialized (db exists)
  // .codemind/ folder alone is fine
  if (fs.existsSync(dbPath)) {
    throw new Error(`CodeMind already initialized in ${projectRoot}`);
  }

  // Create main directory (if it doesn't exist)
  fs.mkdirSync(codemindDir, { recursive: true });

  // Create .gitignore inside .codemind (if it doesn't exist)
  const gitignorePath = path.join(codemindDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    const gitignoreContent = `# CodeMind data files
# These are local to each machine and should not be committed

# Database
*.db
*.db-wal
*.db-shm

# Cache
cache/

# Logs
*.log

# Hook markers
.dirty
`;

    fs.writeFileSync(gitignorePath, gitignoreContent, 'utf-8');
  }
}

/**
 * Remove the .codemind directory
 */
export function removeDirectory(projectRoot: string): void {
  const codemindDir = getCodeMindDir(projectRoot);

  if (!fs.existsSync(codemindDir)) {
    return;
  }

  // Verify .codemind is a real directory, not a symlink pointing elsewhere
  const lstat = fs.lstatSync(codemindDir);
  if (lstat.isSymbolicLink()) {
    // Only remove the symlink itself, never follow it for recursive delete
    fs.unlinkSync(codemindDir);
    return;
  }

  if (!lstat.isDirectory()) {
    // Not a directory - remove the single file
    fs.unlinkSync(codemindDir);
    return;
  }

  // Recursively remove directory
  fs.rmSync(codemindDir, { recursive: true, force: true });
}

/**
 * Get all files in the .codemind directory
 */
export function listDirectoryContents(projectRoot: string): string[] {
  const codemindDir = getCodeMindDir(projectRoot);

  if (!fs.existsSync(codemindDir)) {
    return [];
  }

  const files: string[] = [];

  function walkDir(dir: string, prefix: string = ''): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      // Skip symlinks to prevent following links outside .codemind
      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        walkDir(path.join(dir, entry.name), relativePath);
      } else {
        files.push(relativePath);
      }
    }
  }

  walkDir(codemindDir);
  return files;
}

/**
 * Get the total size of the .codemind directory in bytes
 */
export function getDirectorySize(projectRoot: string): number {
  const codemindDir = getCodeMindDir(projectRoot);

  if (!fs.existsSync(codemindDir)) {
    return 0;
  }

  let totalSize = 0;

  function walkDir(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip symlinks to prevent following links outside .codemind
      if (entry.isSymbolicLink()) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else {
        const stats = fs.statSync(fullPath);
        totalSize += stats.size;
      }
    }
  }

  walkDir(codemindDir);
  return totalSize;
}

/**
 * Ensure a subdirectory exists within .codemind
 */
export function ensureSubdirectory(projectRoot: string, subdirName: string): string {
  if (subdirName.includes('..') || subdirName.includes(path.sep) || subdirName.includes('/')) {
    throw new Error(`Invalid subdirectory name: ${subdirName}`);
  }

  const subdirPath = path.join(getCodeMindDir(projectRoot), subdirName);

  if (!fs.existsSync(subdirPath)) {
    fs.mkdirSync(subdirPath, { recursive: true });
  }

  return subdirPath;
}

/**
 * Check if the .codemind directory has valid structure
 */
export function validateDirectory(projectRoot: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const codemindDir = getCodeMindDir(projectRoot);

  if (!fs.existsSync(codemindDir)) {
    errors.push('CodeMind directory does not exist');
    return { valid: false, errors };
  }

  if (!fs.statSync(codemindDir).isDirectory()) {
    errors.push('.codemind exists but is not a directory');
    return { valid: false, errors };
  }

  // Auto-repair missing .gitignore (non-critical file)
  const gitignorePath = path.join(codemindDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    try {
      const gitignoreContent = `# CodeMind data files\n# These are local to each machine and should not be committed\n\n# Database\n*.db\n*.db-wal\n*.db-shm\n\n# Cache\ncache/\n\n# Logs\n*.log\n\n# Hook markers\n.dirty\n`;
      fs.writeFileSync(gitignorePath, gitignoreContent, 'utf-8');
    } catch {
      // Non-fatal: warn but don't block
      errors.push('.gitignore missing in .codemind directory and could not be created');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

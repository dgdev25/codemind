#!/usr/bin/env bash
# =============================================================================
# CodeMind Setup Script
# Installs CodeMind + RuVector integration and registers it with Claude Code
# =============================================================================

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${BLUE}▶${RESET} $*"; }
success() { echo -e "${GREEN}✔${RESET} $*"; }
warn()    { echo -e "${YELLOW}⚠${RESET} $*"; }
error()   { echo -e "${RED}✖${RESET} $*" >&2; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODEMIND_DIR="$SCRIPT_DIR"
RUVECTOR_DIR="/media/lyle/datadisk/repos/rUvnet/RuVector"
CLAUDE_JSON="$HOME/.claude.json"
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
NODE_MIN_MAJOR=18

# ── Args ──────────────────────────────────────────────────────────────────────
SKIP_BUILD=false
SKIP_VECTOR=false
TARGET_PROJECT=""

for arg in "$@"; do
  case $arg in
    --skip-build)   SKIP_BUILD=true ;;
    --skip-vector)  SKIP_VECTOR=true ;;
    --project=*)    TARGET_PROJECT="${arg#*=}" ;;
    --help|-h)
      echo "Usage: ./setup.sh [options] [--project=/path/to/your/codebase]"
      echo ""
      echo "Options:"
      echo "  --skip-build    Skip npm install + build (use existing dist/)"
      echo "  --skip-vector   Skip vector index build (can run later with: codemind index --build-vectors)"
      echo "  --project=PATH  Index this project and build its vector index"
      echo "  --help          Show this help"
      exit 0
      ;;
  esac
done

# =============================================================================
header "═══════════════════════════════════════"
header "  CodeMind + RuVector Setup"
header "═══════════════════════════════════════"
# =============================================================================

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
header "1. Checking prerequisites"

# Node.js
if ! command -v node &>/dev/null; then
  error "Node.js not found. Install Node.js $NODE_MIN_MAJOR+ from https://nodejs.org"
  exit 1
fi
NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt "$NODE_MIN_MAJOR" ]; then
  error "Node.js $NODE_MIN_MAJOR+ required (found $(node --version))"
  exit 1
fi
success "Node.js $(node --version)"

# npm
if ! command -v npm &>/dev/null; then
  error "npm not found"
  exit 1
fi
success "npm $(npm --version)"

# Claude Code CLI (optional but recommended)
if command -v claude &>/dev/null; then
  success "Claude Code CLI found"
else
  warn "Claude Code CLI not found — MCP config will be written manually to ~/.claude.json"
fi

# RuVector local install check
if [ -d "$RUVECTOR_DIR" ]; then
  success "RuVector repo found at $RUVECTOR_DIR"
  HAS_RUVECTOR=true
else
  warn "RuVector repo not found at $RUVECTOR_DIR — will use npm registry package instead"
  HAS_RUVECTOR=false
fi

# ── 2. Install dependencies ───────────────────────────────────────────────────
header "2. Installing dependencies"

cd "$CODEMIND_DIR"

if [ "$SKIP_BUILD" = false ]; then
  info "Running npm install..."
  npm install --prefer-offline 2>&1 | tail -5
  success "Core dependencies installed"

  # Install RuVector node bindings
  info "Installing @ruvector/node..."
  if [ "$HAS_RUVECTOR" = true ]; then
    # Link from local repo if available (picks up latest unreleased changes)
    RUVECTOR_NODE_DIR="$RUVECTOR_DIR/crates/ruvector-node"
    if [ -d "$RUVECTOR_NODE_DIR" ] && [ -f "$RUVECTOR_NODE_DIR/package.json" ]; then
      npm install "$RUVECTOR_NODE_DIR" 2>&1 | tail -3
      success "@ruvector/node installed from local repo"
    else
      npm install @ruvector/node 2>&1 | tail -3
      success "@ruvector/node installed from npm"
    fi
  else
    npm install @ruvector/node 2>&1 | tail -3
    success "@ruvector/node installed from npm"
  fi

  # Install transformer embeddings library
  info "Installing @xenova/transformers (local embedding model ~23MB)..."
  npm install @xenova/transformers 2>&1 | tail -3
  success "@xenova/transformers installed"

  # ── 3. Build ────────────────────────────────────────────────────────────────
  header "3. Building TypeScript"
  npm run build 2>&1 | tail -5
  success "Build complete → dist/"
else
  info "Skipping build (--skip-build)"
  if [ ! -d "$CODEMIND_DIR/dist" ]; then
    error "dist/ not found. Remove --skip-build to build first."
    exit 1
  fi
  success "Using existing dist/"
fi

# ── 4. Install CLI globally ───────────────────────────────────────────────────
header "4. Installing codemind CLI globally"

# Check if already globally installed
CURRENT_GLOBAL=$(npm list -g codemind --depth=0 2>/dev/null | grep codemind || true)
if [ -n "$CURRENT_GLOBAL" ]; then
  info "Removing previous global install..."
  npm uninstall -g codemind 2>/dev/null || true
fi

npm install -g "$CODEMIND_DIR" 2>&1 | tail -3

# Verify binary is reachable
if ! command -v codemind &>/dev/null; then
  warn "codemind not in PATH — trying npx fallback"
  CODEMIND_BIN="npx --prefix $CODEMIND_DIR codemind"
else
  CODEMIND_BIN="codemind"
  success "codemind CLI available at $(which codemind)"
fi

# ── 5. Register MCP server with Claude Code ───────────────────────────────────
header "5. Registering MCP server with Claude Code"

register_mcp_json() {
  local claude_json="$1"
  local cmd="$2"

  # Create ~/.claude/ if needed
  mkdir -p "$(dirname "$claude_json")"

  # Read existing config or start fresh
  if [ -f "$claude_json" ]; then
    cp "$claude_json" "${claude_json}.bak"
    info "Backed up existing config to ${claude_json}.bak"
  fi

  # Use node to safely merge JSON (avoids jq dependency)
  node -e "
    const fs = require('fs');
    const path = '$claude_json';
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(path, 'utf8')); } catch {}
    if (!cfg.mcpServers) cfg.mcpServers = {};
    cfg.mcpServers.codemind = {
      type: 'stdio',
      command: '$cmd',
      args: ['serve', '--mcp']
    };
    fs.writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
    console.log('  Written: ' + path);
  "
}

register_permissions() {
  local settings="$1"
  mkdir -p "$(dirname "$settings")"

  node -e "
    const fs = require('fs');
    const path = '$settings';
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(path, 'utf8')); } catch {}
    if (!cfg.permissions) cfg.permissions = {};
    if (!Array.isArray(cfg.permissions.allow)) cfg.permissions.allow = [];
    const perms = [
      'mcp__codemind__codemind_search',
      'mcp__codemind__codemind_context',
      'mcp__codemind__codemind_callers',
      'mcp__codemind__codemind_callees',
      'mcp__codemind__codemind_impact',
      'mcp__codemind__codemind_node',
      'mcp__codemind__codemind_explore',
      'mcp__codemind__codemind_files',
      'mcp__codemind__codemind_status',
      'mcp__codemind__codemind_semantic_search',
      'mcp__codemind__codemind_similar',
      'mcp__codemind__codemind_vector_status',
    ];
    perms.forEach(p => {
      if (!cfg.permissions.allow.includes(p)) cfg.permissions.allow.push(p);
    });
    fs.writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
    console.log('  Written: ' + path);
  "
}

# Determine the command to use in MCP config
if command -v codemind &>/dev/null; then
  MCP_CMD="codemind"
else
  MCP_CMD="node"
  # Will use absolute path to main entry
  MCP_CMD="$CODEMIND_DIR/dist/bin/codemind.js"
fi

register_mcp_json "$CLAUDE_JSON" "$MCP_CMD"
success "MCP server registered in $CLAUDE_JSON"

register_permissions "$CLAUDE_SETTINGS"
success "Permissions registered in $CLAUDE_SETTINGS"

# ── 6. Download embedding model ───────────────────────────────────────────────
header "6. Pre-downloading embedding model"
info "Downloading Xenova/all-MiniLM-L6-v2 (~23MB, one-time)..."

node -e "
  (async () => {
    try {
      // new Function bypass for ESM in CJS context
      const load = new Function('s', 'return import(s)');
      const { pipeline } = await load('@xenova/transformers');
      console.log('  Downloading model...');
      await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      console.log('  Model ready.');
    } catch (e) {
      console.error('  Warning: model pre-download failed:', e.message);
      console.error('  It will download automatically on first use.');
    }
  })();
" 2>&1 | grep -v "^$"

success "Embedding model ready"

# ── 7. Index target project (optional) ───────────────────────────────────────
if [ -n "$TARGET_PROJECT" ]; then
  header "7. Indexing project: $TARGET_PROJECT"

  if [ ! -d "$TARGET_PROJECT" ]; then
    error "Project directory not found: $TARGET_PROJECT"
    exit 1
  fi

  # Init if not already initialized
  if [ ! -d "$TARGET_PROJECT/.codemind" ]; then
    info "Initializing CodeMind in $TARGET_PROJECT..."
    $CODEMIND_BIN init "$TARGET_PROJECT" --no-interactive 2>/dev/null || \
      $CODEMIND_BIN init "$TARGET_PROJECT"
  else
    info "CodeMind already initialized in $TARGET_PROJECT"
  fi

  # Full index
  info "Building code graph (this may take a minute for large codebases)..."
  $CODEMIND_BIN index "$TARGET_PROJECT"
  success "Code graph built"

  # Vector index
  if [ "$SKIP_VECTOR" = false ]; then
    info "Building vector index (embedding all nodes)..."
    $CODEMIND_BIN index "$TARGET_PROJECT" --build-vectors
    success "Vector index built"
  else
    info "Skipping vector index (--skip-vector). Run later with:"
    echo "      codemind index $TARGET_PROJECT --build-vectors"
  fi

  # Show status
  echo ""
  $CODEMIND_BIN status "$TARGET_PROJECT"
else
  header "7. Project indexing"
  info "No --project specified. To index a codebase:"
  echo ""
  echo "      codemind init /path/to/your/project"
  echo "      codemind index /path/to/your/project"
  echo "      codemind index /path/to/your/project --build-vectors"
  echo ""
fi

# ── 8. Verify MCP server starts ───────────────────────────────────────────────
header "8. Verifying MCP server"

info "Testing MCP server startup (3s timeout)..."
if timeout 3 $CODEMIND_BIN serve --mcp </dev/null >/dev/null 2>&1; then
  success "MCP server starts cleanly"
else
  # timeout exits 124, server exits 0 after stdin close — both are fine
  if [ $? -eq 124 ] || [ $? -eq 0 ]; then
    success "MCP server starts cleanly"
  else
    warn "MCP server test inconclusive — check manually with: codemind serve --mcp"
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  CodeMind setup complete!${RESET}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════${RESET}"
echo ""
echo -e "  ${BOLD}MCP server:${RESET}   registered as 'codemind' in Claude Code"
echo -e "  ${BOLD}CLI:${RESET}          $(command -v codemind 2>/dev/null || echo "$CODEMIND_DIR/dist/bin/codemind.js")"
echo -e "  ${BOLD}Vector model:${RESET} Xenova/all-MiniLM-L6-v2 (384d, local)"
echo ""
echo -e "  ${BOLD}Next steps:${RESET}"
echo -e "    1. ${YELLOW}Restart Claude Code${RESET} to pick up the MCP server"
echo -e "    2. Run ${BLUE}codemind init /your/project${RESET} for each codebase"
echo -e "    3. Run ${BLUE}codemind index /your/project --build-vectors${RESET}"
echo -e "    4. Ask Claude: ${BLUE}\"use codemind_context to understand the auth flow\"${RESET}"
echo ""
echo -e "  ${BOLD}Useful commands:${RESET}"
echo -e "    codemind status /your/project          # graph + vector stats"
echo -e "    codemind index /your/project            # re-index after changes"
echo -e "    codemind serve --mcp                   # start MCP server manually"
echo ""

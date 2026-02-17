#!/usr/bin/env bash
set -euo pipefail

# Starts the D&D MCP server from the submodule directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT/dnd-mcp"

if [[ ! -d node_modules ]]; then
  echo "node_modules not found. Run: npm install" >&2
  exit 1
fi

if [[ ! -d dist ]]; then
  echo "dist not found. Run: npm run build" >&2
  exit 1
fi

npm start

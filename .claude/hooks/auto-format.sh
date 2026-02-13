#!/bin/bash
# Auto-format files after Write/Edit tool use
# Reads tool input JSON from stdin to get the file path

set -e

# Read JSON input and extract file_path
FILE_PATH=$(jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Get file extension
EXT="${FILE_PATH##*.}"

case "$EXT" in
  py)
    # Format Python files with ruff
    if [ -f "$FILE_PATH" ]; then
      cd "$CLAUDE_PROJECT_DIR/backend" && uv run ruff format "../$FILE_PATH" 2>/dev/null || true
    fi
    ;;
  ts|tsx|js|jsx)
    # Format TypeScript/JavaScript files with prettier
    if [ -f "$FILE_PATH" ]; then
      cd "$CLAUDE_PROJECT_DIR/extension" && npx prettier --write "../$FILE_PATH" 2>/dev/null || true
    fi
    ;;
  json|html|css)
    # Format JSON/HTML/CSS files with prettier
    if [ -f "$FILE_PATH" ]; then
      cd "$CLAUDE_PROJECT_DIR/extension" && npx prettier --write "../$FILE_PATH" 2>/dev/null || true
    fi
    ;;
esac

exit 0

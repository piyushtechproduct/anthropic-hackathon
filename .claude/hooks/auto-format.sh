#!/bin/bash
# Auto-format hook — runs after Claude Code edits or writes a file
# Reads JSON from stdin to extract the file path

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Python files — format with ruff
if [[ "$FILE_PATH" == *.py ]]; then
  cd "$CLAUDE_PROJECT_DIR/backend" 2>/dev/null && uv run ruff format "$FILE_PATH" 2>/dev/null
  exit 0
fi

# TypeScript / JavaScript files — format with prettier
if [[ "$FILE_PATH" == *.ts || "$FILE_PATH" == *.tsx || "$FILE_PATH" == *.js || "$FILE_PATH" == *.jsx ]]; then
  cd "$CLAUDE_PROJECT_DIR/extension" 2>/dev/null && npx prettier --write "$FILE_PATH" 2>/dev/null
  exit 0
fi

# JSON files — format with prettier
if [[ "$FILE_PATH" == *.json ]]; then
  cd "$CLAUDE_PROJECT_DIR/extension" 2>/dev/null && npx prettier --write "$FILE_PATH" 2>/dev/null
  exit 0
fi

# HTML / CSS files — format with prettier
if [[ "$FILE_PATH" == *.html || "$FILE_PATH" == *.css ]]; then
  cd "$CLAUDE_PROJECT_DIR/extension" 2>/dev/null && npx prettier --write "$FILE_PATH" 2>/dev/null
  exit 0
fi

exit 0

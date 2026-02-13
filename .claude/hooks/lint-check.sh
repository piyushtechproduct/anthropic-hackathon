#!/bin/bash
# Run lint checks on prompt submit (non-blocking)

set -e

# Backend: Run ruff check (non-blocking)
if [ -d "$CLAUDE_PROJECT_DIR/backend" ]; then
  cd "$CLAUDE_PROJECT_DIR/backend" && uv run ruff check . --exit-zero 2>/dev/null || true
fi

# Extension: Run eslint (non-blocking)
if [ -d "$CLAUDE_PROJECT_DIR/extension" ]; then
  cd "$CLAUDE_PROJECT_DIR/extension" && npx eslint src/ --no-error-on-unmatched-pattern 2>/dev/null || true
fi

exit 0

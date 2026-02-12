#!/bin/bash
# Lint check hook — runs on prompt submit to surface issues early
# Non-blocking: always exits 0 so it never prevents Claude Code from working

INPUT=$(cat)

# Python lint with ruff
cd "$CLAUDE_PROJECT_DIR/backend" 2>/dev/null && uv run ruff check . --exit-zero 2>/dev/null

# TypeScript lint with eslint
cd "$CLAUDE_PROJECT_DIR/extension" 2>/dev/null && npx eslint src/ --no-error-on-unmatched-pattern 2>/dev/null || true

exit 0

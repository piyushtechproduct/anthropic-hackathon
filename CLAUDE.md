# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Commerce Agent — a browser extension (Chrome MV3) that assists users through e-commerce buying journeys on Indian platforms. The system uses a hybrid client+cloud architecture where LLMs decide "what" and deterministic code decides "how."

**Current status**: Hackathon prototype. Amazon India only, search + filters only. No cart, checkout, personalization, or multi-platform support.

## Key Documentation

- `docs/AI_COMMERCE_AGENT_SPEC.md` — Primary technical specification (14 sections covering architecture, LLM usage, guardrails, failure handling, test cases)
- `docs/AI_COMMERCE_AGENT_ANALYSIS.md` — Strategic analysis and refined implementation roadmap with identified gaps and risks
- `docs/Use Case Questionnaire.md` — Business requirements (scale: millions of users/day, 3-month timeline)
- `docs/devarchreq.md` — Development environment architecture (LLM-based agentic development pipeline)

## Architecture

**Client-side (Browser Extension):**
- DOM Parser/Adapter Layer → extracts filters from e-commerce pages
- Filter Normalizer → converts UI labels to machine-usable metadata
- Action Executor → deterministic clicks only (never LLM-driven)
- Client Guardrails → validates all API responses, enforces whitelists

**Cloud Services (Stateless APIs):**
- Intent Service (Claude API) → structured intent from user prompts
- Personalization Service → enriches intent with user context
- Search Plan Builder → generates platform-specific search URLs
- Filter Matching Service → maps intent constraints to normalized filters (embedding-based)

**Storage:** Redis (hot preferences), Neo4j (user graph), Vector DB (behavioral similarity), Platform Config Store (versioned adapter configs)

## Critical Design Constraints

- **Zero Trust for LLM Outputs**: JSON schema validation, whitelisted IDs only — no raw LLM output reaches the DOM
- **No LLM-triggered clicks**: All UI interactions are rule-based deterministic code
- **Privacy-first**: Credentials and raw DOM never leave the device
- **Progressive Autonomy**: Search/filters (full autonomy) → Cart (assisted) → Payment (human-only)
- **Pluggable adapter system**: Each e-commerce platform has its own adapter so platforms can be added/updated without code rewrites

## Tech Stack

- **Backend**: FastAPI (Python 3.12), Claude API for intent extraction, managed with uv
- **Frontend**: Chrome Extension (TypeScript, Manifest V3), Vite build
- **Testing**: Pytest (backend), Vitest (frontend)
- **Linting**: Ruff (backend), ESLint + Prettier (frontend)

## Development Commands

### Backend

```bash
# Run the FastAPI server
cd backend && uv run uvicorn src.app.main:app --reload

# Run tests
cd backend && uv run pytest

# Lint
cd backend && uv run ruff check .
```

### Extension

```bash
# Build the Chrome extension
cd extension && npm run build

# Run tests
cd extension && npx vitest

# Lint
cd extension && npx eslint src/
```

## Hackathon Scope

See `docs/HACKATHON_SCOPE.md` for the full plan. In short:

- **Amazon India only** — no other platforms
- **Search + filter application only** — no cart, checkout, or payment
- **Single FastAPI endpoint** — Claude API does intent extraction + filter plan in one call
- **Chrome Side Panel** — chat-style UI using `chrome.sidePanel` API
- **No databases** — no Redis, Neo4j, or Vector DB for this prototype

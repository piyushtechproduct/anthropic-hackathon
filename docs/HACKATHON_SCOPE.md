# Hackathon Scope — AI Commerce Agent

## What We Built

A Chrome Extension with a Side Panel chat interface that searches **both Amazon India and Flipkart simultaneously**. The user clicks the extension icon, types something like *"white Nike t-shirt under 500, fast delivery"*, and the agent:

1. Understands the intent (via Claude API) for both platforms
2. Opens **hidden background tabs** for Amazon and Flipkart simultaneously
3. Applies filters on each platform (price via URL params, others via DOM clicks)
4. Extracts and ranks products from both platforms
5. Displays an **interleaved product carousel** with platform badges in the side panel

**Two platforms**: Amazon India + Flipkart.
**Full flow**: Search → filter application → product extraction → ranking → carousel display.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Chrome Extension (MV3)                                  │
│                                                          │
│  Side Panel ←→ Service Worker ←→ Content Scripts         │
│  (Carousel UI)   (Coordinator)    (Platform Adapters)    │
│                     │                                    │
│                     ├── Hidden Tab: amazon.in             │
│                     │   └── AmazonAdapter                │
│                     │                                    │
│                     ├── Hidden Tab: flipkart.com          │
│                     │   └── FlipkartAdapter              │
│                     │                                    │
│                     │  Promise.allSettled (parallel)      │
└─────────────────────┼────────────────────────────────────┘
                      │ HTTP
                      ▼
              ┌─────────────────┐
              │  FastAPI         │
              │                 │
              │  /api/intent    │  (single-platform, legacy)
              │  /api/intent/multi │  (dual-platform)
              │  /api/rank      │  (product ranking)
              │       │         │
              │  Claude API     │
              │  (Sonnet 4.5)   │
              └─────────────────┘
```

### Extension Components

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest — `activeTab`, `scripting`, `sidePanel`, `storage`, `tabs` permissions; host permissions for `amazon.in` and `flipkart.com` |
| `sidepanel.html` + `sidepanel.ts` | Chat UI with product carousel — input box, status indicators, product cards with platform badges, star ratings, prices |
| `background.ts` | Service Worker — orchestrates hidden tabs per platform, parallel processing via `Promise.allSettled`, deterministic fallback ranking, product interleaving |
| `content.ts` | Content script — routes to platform-specific adapter based on hostname; guarded by `globalThis.__aiCommerceContent` to prevent double-injection |
| `adapters/types.ts` | `PlatformAdapter` interface: `waitForFilters()`, `applyOneFilter(filter)`, `extractProducts(count)` |
| `adapters/amazon.ts` | Amazon DOM parser — 4-strategy cascade (aria-label → scoped section → full sidebar → expand & retry); skips sponsored results |
| `adapters/flipkart.ts` | Flipkart DOM parser — checkbox filters for brand/size/color/rating; structural selectors (`a[href*="/p/"]`, `₹` price patterns); LCA algorithm to group product cards |
| `types.ts` | Shared types: `Filter`, `Product`, `PlatformIntent`, `MultiPlatformIntentResponse`, `RankResponse` |

### Backend

FastAPI app (`backend/src/app/`) with three endpoints:

| Endpoint | Input | Output | Purpose |
|----------|-------|--------|---------|
| `POST /api/intent` | `{ prompt }` | `{ raw_query, search_url, filters }` | Single-platform (Amazon only), backward compatibility |
| `POST /api/intent/multi` | `{ prompt }` | `{ raw_query, platforms: [{ platform, search_url, filters }] }` | Dual-platform intent extraction (Amazon + Flipkart) |
| `POST /api/rank` | `{ query, products }` | `{ ranked_products }` | LLM-based ranking with deterministic fallback |
| `GET /health` | — | `{ status: "ok" }` | Health check |

**LLM**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) for intent extraction and ranking.

**Filter types supported**: `brand`, `price` (format: "Under ₹X"), `delivery` (Amazon: "Prime", Flipkart: "Flipkart Assured"), `rating` ("4★ & up"), `color`, `size`, `discount`.

---

## How It Works

### 1. Intent Extraction

The user types a natural language query. The backend sends it to Claude with a system prompt that extracts structured intent for **both** Amazon and Flipkart, returning platform-specific search URLs and filter lists.

### 2. Hidden Tab Orchestration

The service worker creates **hidden background tabs** (one per platform) using `chrome.tabs.create({ active: false })`. Each tab:
1. Navigates to the platform search URL (with price filter baked into URL params)
2. Waits for page load
3. Injects the content script
4. Applies remaining filters one by one (waiting for possible page reloads between each)
5. Extracts up to 10 products

Both platforms run in **parallel** via `Promise.allSettled` — if one fails, the other's results still display.

### 3. Adapter Pattern

`content.ts` detects the platform from `window.location.hostname` and instantiates the correct adapter:

- **Amazon adapter**: Uses `#s-refinements` sidebar, 4-strategy cascade for filter matching, `a-price-whole` for prices, skips sponsored (`/sspa/`) results
- **Flipkart adapter**: Uses structural selectors (stable across UI updates), checkbox-based filters, dual layout support (grid for fashion, list for electronics), LCA algorithm for card deduplication

### 4. Price Filter Strategy

Price filters are applied via **URL parameters** (not DOM clicks) for reliability:
- Amazon: `rh=p_36%3A-<paise>` (converts ₹ to paise)
- Flipkart: `p[]=facets.price_range.from=Min&p[]=facets.price_range.to=<amount>`

### 5. Product Ranking

Products from both platforms are ranked using:
1. **LLM ranking** (Claude API via `/api/rank`) — preferred
2. **Deterministic fallback** — `score = (rating × log(reviewCount + 1)) / price`

Top 3 products per platform are interleaved (Amazon, Flipkart, Amazon, Flipkart...) for the carousel.

### 6. Carousel UI

The side panel renders product cards with:
- Product image, title (truncated), price in ₹ format
- Star ratings + review counts (formatted: "1.5L", "2.3K")
- Platform badge (orange = Amazon, blue = Flipkart)
- Clickable link to the product page

---

## Build System

| Component | Tool | Command |
|-----------|------|---------|
| Extension build | **esbuild** | `esbuild src/background.ts src/content.ts src/sidepanel.ts --bundle --outdir=dist --format=iife --target=chrome114` |
| Extension tests | Vitest | `npx vitest` |
| Extension lint | ESLint + Prettier | `npx eslint src/` |
| Backend server | uvicorn | `uv run uvicorn src.app.main:app --reload` |
| Backend tests | Pytest | `uv run pytest` |
| Backend lint | Ruff | `uv run ruff check .` |
| Backend deps | uv | `pyproject.toml`, Python 3.12+ |

Note: Vite is a dev dependency (used by Vitest) but the extension **build** uses esbuild directly.

---

## Claude Code Features to Demonstrate

These are about **how we built** the project, not what the project does.

### 1. MCP Servers

Three MCP servers are configured for this project:

| Server | Transport | Configuration | Purpose |
|--------|-----------|---------------|---------|
| **Filesystem** | stdio | `npx -y @modelcontextprotocol/server-filesystem <project-dir>` | File operations scoped to project directory |
| **Commerce Agent** | stdio | `uv run --directory backend python mcp_server.py` | Exposes intent extraction as Claude Code tools |
| **Playwright** | stdio | `npx @anthropic/mcp-playwright@latest` | Browser automation for the `/test-flow` skill |

The **Commerce Agent MCP server** (`backend/mcp_server.py`) wraps the FastAPI backend and exposes two tools:

- `extract_shopping_intent(prompt)` — single-platform (Amazon) intent extraction → `{ search_url, filters[], raw_query }`
- `extract_multi_platform_shopping_intent(prompt)` — dual-platform (Amazon + Flipkart) intent extraction → `{ raw_query, platforms[] }`

**Demo point**: Ask Claude Code *"Use the extract_multi_platform_shopping_intent tool for running shoes under 2000"* and watch it invoke your custom MCP tool.

### 2. GitHub Actions

CI pipeline at `.github/workflows/ci.yml` with two parallel jobs:

| Job | Steps |
|-----|-------|
| **backend** | Checkout → setup uv → Python 3.12 → `uv sync` → `uv run ruff check .` → `uv run pytest -v` |
| **extension** | Checkout → Node 20 → `npm ci` → `npm run build` → verify dist files exist |

Triggers on push to `main` and `feature/*` branches, and on pull requests to `main`.

**Demo point**: Show the green check on GitHub and the parallel job execution.

### 3. Sub Agents

During development, Claude Code used sub agents to parallelize work:

- One agent built the backend (FastAPI + Claude API integration)
- Another agent built the extension scaffold (manifest, side panel, service worker, content script)

Evidence visible in git history — backend and extension commits interleave.

### 4. Hooks

Configured in `.claude/settings.json` with scripts in `.claude/hooks/`:

| Hook Event | Script | What It Does |
|------------|--------|-------------|
| **PostToolUse** (matcher: `Write\|Edit`) | `auto-format.sh` | Detects file type and runs: `.py` → `ruff format`, `.ts/.tsx/.js/.jsx` → `prettier --write`, `.json/.html/.css` → `prettier --write` |
| **UserPromptSubmit** | `lint-check.sh` | Runs `ruff check . --exit-zero` (backend) and `eslint src/` (extension) — non-blocking, informational |

**Demo point**: Edit a Python file → see "Auto-formatting..." appear. Submit a prompt → see "Running lint checks..." briefly.

### 5. Skills

Custom skill at `.claude/skills/test-flow/SKILL.md` — invoked via `/test-flow`.

**4-phase end-to-end test**:

| Phase | What | Tools Used |
|-------|------|-----------|
| 1. API Health & Smoke | `GET /health` → `POST /api/intent` with test prompt → validate response shape | Bash (curl) |
| 2. Swagger UI | Navigate to `/docs` → expand `POST /api/intent` → "Try it out" → execute → validate 200 | Playwright |
| 3. Search URL Navigation | Extract `search_url` from response → navigate → verify Amazon results load → screenshot | Playwright |
| 4. Cleanup | Close browser → print pass/fail summary table | Playwright, Bash |

**Demo point**: Run `/test-flow` and watch it exercise the API, open a browser, navigate Swagger UI, and load Amazon search results.

### 6. Sandboxing

Claude Code sandboxes all potentially destructive operations and requires explicit permission.

**Demo point**: Ask Claude Code *"Delete all files in the backend/tests directory"* → show the permission prompt → deny it. Explain: *"Claude Code sandboxes destructive operations. This prevents accidental damage."*

### 7. Parallel Claude + CLAUDE.md

Multiple Claude Code instances can run simultaneously on the same project. `CLAUDE.md` at the project root provides shared context — architecture, commands, constraints — so all instances stay aligned.

**Demo point**: Mention that backend and extension were developed in parallel Claude Code sessions, both reading from the same `CLAUDE.md`.

---

## Demo Script

1. Start the backend: `cd backend && uv run uvicorn src.app.main:app --reload`
2. Build the extension: `cd extension && npm run build`
3. Load `extension/dist/` as unpacked extension in `chrome://extensions`
4. Open any Chrome tab, click the extension icon → Side Panel opens
5. Type: **"white tshirt under 500 with fast delivery"**
6. Watch the side panel show progress: "Understanding your request...", "Searching Amazon & Flipkart..."
7. Products appear in a carousel with alternating Amazon (orange) / Flipkart (blue) badges
8. Each card shows title, price, image, rating, and platform indicator
9. ~6 products displayed: ~3 from Amazon, ~3 from Flipkart, interleaved by rank

---

## Time Plan

| Hours | What | Claude Code Features Used |
|-------|------|--------------------------|
| **0–0.5** | Project scaffold: git init, CLAUDE.md, `uv init` + `npm init`, directory structure | GitHub repo setup |
| **0.5–1** | Configure Claude Code: hooks, `/test-flow` skill, MCP servers (Filesystem) | Hooks, Skills, MCP |
| **1–2.5** | Build backend: FastAPI + Claude API intent extraction + tests | Sub agents (parallel with extension) |
| **1–2.5** | Build extension: manifest, side panel, background service worker, content script | Parallel Claude, Sub agents |
| **2.5–4** | Wire end-to-end: side panel → backend → content script, fix JSON parsing, page reload handling | — |
| **4–5** | GitHub Actions CI, custom MCP server (`backend/mcp_server.py`), upgrade `/test-flow` with Playwright | GitHub Actions, MCP, Skills |
| **5–6** | Harden Amazon: 4-strategy filter cascade, price via URL params, "See more" expansion | Skills (`/test-flow`) |
| **6–7** | Multi-platform pivot: `PlatformAdapter` interface, Flipkart adapter, hidden tabs, `/api/intent/multi` | Sub agents |
| **7–8** | Product extraction, `/api/rank`, carousel UI, Flipkart fixes, demo prep | All features recap |

---

## Detailed Plan

### Step 0–0.5: Project Scaffold

This step sets up the project foundation. You'll work in your terminal and Claude Code side by side.

#### 0a. Initialize Git (2 min)

Open your terminal in the project directory and run:

```bash
cd ~/pythonProjects/aicommerceanalysis
git init
```

Then create a `.gitignore`. Ask Claude Code:

> "Create a .gitignore for a project that has a Python backend (uv, pytest, ruff) and a TypeScript Chrome Extension (node_modules, dist). Include macOS .DS_Store, .env files, and IDE folders."

#### 0b. Create the Monorepo Directory Structure (3 min)

Ask Claude Code:

> "Create the following empty directory structure:
> - `backend/` — Python FastAPI backend
> - `backend/src/app/` — application code
> - `backend/tests/` — pytest tests
> - `extension/` — Chrome Extension
> - `extension/src/` — extension source code
> - `extension/src/adapters/` — platform-specific adapter implementations
> - `extension/tests/` — extension tests"

#### 0c. Initialize the Python Backend with uv (5 min)

Ask Claude Code:

> "Initialize a Python project in the `backend/` directory using `uv init`. Then add these dependencies:
> - Runtime: fastapi, uvicorn[standard], pydantic, anthropic, python-dotenv, mcp
> - Dev: pytest, pytest-asyncio, httpx, ruff
>
> Set the Python version to 3.12. Set the project name to `ai-commerce-backend`."

This creates:

- `backend/pyproject.toml` — project config and dependencies
- `backend/uv.lock` — locked dependency versions
- `backend/.python-version` — Python version pin

**What to watch for**: If `uv` is not installed, install with `curl -LsSf https://astral.sh/uv/install.sh | sh`.

#### 0d. Initialize the Chrome Extension with npm (5 min)

Ask Claude Code:

> "Initialize a Node.js project in the `extension/` directory using `npm init -y`. Then install:
> - Dev dependencies: typescript, esbuild, @types/chrome, vitest, eslint, prettier
>
> Set the project name to `ai-commerce-extension`. Create a basic tsconfig.json with strict mode enabled, targeting ES2020 with module ESNext.
>
> Add a build script to package.json:
> `\"build\": \"esbuild src/background.ts src/content.ts src/sidepanel.ts --bundle --outdir=dist --format=iife --target=chrome114 && cp src/manifest.json dist/ && cp src/sidepanel.html dist/\"`"

**Note**: We use **esbuild** (not Vite) for the production build. Vite is only used by Vitest for testing.

This creates:

- `extension/package.json` — project config with esbuild build script
- `extension/node_modules/` — installed packages (ignored by git)
- `extension/tsconfig.json` — TypeScript config

#### 0e. Create a .env.example (2 min)

Ask Claude Code:

> "Create a `.env.example` file at the project root with:
> ```
> ANTHROPIC_API_KEY=your-api-key-here
> BACKEND_PORT=8000
> ```
> Also create an actual `.env` file with the same content. I'll fill in my real API key."

After Claude Code creates it, open `.env` and paste your real Anthropic API key. **Never commit the `.env` file**.

#### 0f. Update CLAUDE.md (3 min)

Ask Claude Code:

> "Update CLAUDE.md to reflect the hackathon scope. Add a section called 'Development Commands' with:
> - Backend: `cd backend && uv run uvicorn src.app.main:app --reload`
> - Backend tests: `cd backend && uv run pytest`
> - Backend lint: `cd backend && uv run ruff check .`
> - Extension build: `cd extension && npm run build`
> - Extension tests: `cd extension && npx vitest`
> - Extension lint: `cd extension && npx eslint src/`
>
> Note that this is a hackathon prototype — Amazon India + Flipkart, search + filters + product comparison."

#### 0g. Push to GitHub (3 min)

Ask Claude Code:

> "Create an initial git commit with everything we have so far. Then add the remote origin and push."

#### Checkpoint (0.5 hours done)

At this point you should have:

- [x] Git repo initialized with `.gitignore`
- [x] `backend/` with `pyproject.toml`, dependencies installed via uv
- [x] `extension/` with `package.json`, `tsconfig.json`, esbuild build script
- [x] `.env.example` and `.env` with your API key
- [x] Updated `CLAUDE.md` with dev commands
- [x] Pushed to GitHub
- [x] Clean directory structure ready for code

Run `git log --oneline` and `ls -la backend/ extension/` to verify.

---

### Step 0.5–1: Configure Claude Code Hooks, Skills, and MCP Servers

This step sets up Claude Code tooling that you'll demonstrate during the hackathon.

#### 1a. Create the .claude directory structure (1 min)

Ask Claude Code:

> "Create the following directory structure under `.claude/`:
> - `.claude/hooks/` — for hook scripts
> - `.claude/skills/test-flow/` — for the /test-flow skill"

#### 1b. Set up Hooks (10 min)

**Hook 1: Auto-format after file edits**

Ask Claude Code:

> "Create a hook script at `.claude/hooks/auto-format.sh` that:
> - Reads JSON from stdin to get the file path (from `tool_input.file_path` using jq)
> - If the file is `.py`, runs `uv run ruff format` on it
> - If the file is `.ts`, `.tsx`, `.js`, or `.jsx`, runs `npx prettier --write` on it
> - If the file is `.json`, `.html`, or `.css`, runs `npx prettier --write` on it
> - Always exits 0
>
> Make the script executable."

**Hook 2: Lint check on prompt submit**

Ask Claude Code:

> "Create a hook script at `.claude/hooks/lint-check.sh` that:
> - Runs `cd backend && uv run ruff check . --exit-zero` for Python
> - Runs `cd extension && npx eslint src/ --no-error-on-unmatched-pattern 2>/dev/null || true` for TypeScript
> - Always exits 0 (non-blocking, just informational)
>
> Make the script executable."

**Register the hooks**

Ask Claude Code:

> "Create `.claude/settings.json` with the following hooks configuration:
> - `PostToolUse` hook: matcher `Write|Edit`, runs `.claude/hooks/auto-format.sh` with status message 'Auto-formatting...'
> - `UserPromptSubmit` hook: runs `.claude/hooks/lint-check.sh` with status message 'Running lint checks...'
>
> Use `$CLAUDE_PROJECT_DIR` in the command paths so they work regardless of working directory.
> Set `enabledPlugins` to an empty object."

The resulting `.claude/settings.json` should look like:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/auto-format.sh",
            "statusMessage": "Auto-formatting..."
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/lint-check.sh",
            "statusMessage": "Running lint checks..."
          }
        ]
      }
    ]
  },
  "enabledPlugins": {}
}
```

**How to verify**: Edit any `.py` file via Claude Code — you should see "Auto-formatting..." appear. Submit any prompt — you should see "Running lint checks..." briefly.

#### 1c. Set up Custom Skill — /test-flow (5 min)

Skills are custom slash commands. We'll create `/test-flow` — an end-to-end test that starts simple (curl-based) and gets upgraded with Playwright browser testing later (step 4–5).

Ask Claude Code:

> "Create `.claude/skills/test-flow/SKILL.md` with:
> - Frontmatter: name `test-flow`, description 'End-to-end test of the commerce agent', user-invocable true, allowed-tools `Bash, Read, Write`
> - Instructions: Send a sample prompt ('white nike tshirt under 500 fast delivery') to `http://localhost:8000/api/intent` using curl. Validate the response has `search_url` and `filters` fields. Report pass/fail."

The initial version uses only curl. In step 4–5, we'll upgrade it with Playwright for browser-based testing.

**How to verify**: Type `/test-flow` in Claude Code — it should appear in autocomplete.

#### 1d. Set up Filesystem MCP Server (5 min)

Ask Claude Code:

> "Add a filesystem MCP server to this project:
> ```
> claude mcp add --transport stdio filesystem -- npx -y @modelcontextprotocol/server-filesystem /Users/saurabh.karmakar/pythonProjects/aicommerceanalysis
> ```"

Verify with `claude mcp list`.

#### 1e. Create permissions whitelist (3 min)

Ask Claude Code:

> "Create `.claude/settings.local.json` with a permissions whitelist allowing:
> - Filesystem MCP operations (read_text_file, list_directory, read_multiple_files)
> - Bash commands: `uv run pytest`, `uv run ruff check`, `npx eslint`, `npm run build`
> - Git operations: `git add`, `git commit`, `git push`
> - Playwright MCP operations: browser_navigate, browser_snapshot, browser_click, browser_evaluate"

#### 1f. Commit (2 min)

> "Commit the `.claude/` configuration with message 'Add Claude Code hooks for auto-formatting and lint checks'."

#### Checkpoint (1 hour done)

- [x] `.claude/hooks/auto-format.sh` — auto-formats Python and TypeScript files after edits
- [x] `.claude/hooks/lint-check.sh` — runs ruff + eslint on prompt submit
- [x] `.claude/settings.json` — hooks registered for PostToolUse and UserPromptSubmit
- [x] `.claude/settings.local.json` — permissions whitelist
- [x] `.claude/skills/test-flow/SKILL.md` — custom `/test-flow` slash command (curl-only version)
- [x] Filesystem MCP server configured
- [x] All committed and pushed

---

### Step 1–2.5: Build the Backend (runs in parallel with extension)

This step and the next (extension build) run **in parallel** — that's the Sub Agents / Parallel Claude demo. Open two Claude Code terminals side by side, or use sub agents.

#### 2a. Create the FastAPI app entry point (10 min)

Ask Claude Code:

> "Create `backend/src/app/main.py` with a FastAPI app that has:
> - Title: 'AI Commerce Agent'
> - A health check endpoint: `GET /health` returning `{"status": "ok"}`
> - CORS middleware allowing all origins (for the Chrome extension)
> - Load environment variables from `.env` using python-dotenv
>
> Also create `backend/src/__init__.py` and `backend/src/app/__init__.py`."

**Verify**: Run `cd backend && uv run uvicorn src.app.main:app --reload` and `curl http://localhost:8000/health`.

#### 2b. Create the Pydantic models (5 min)

Ask Claude Code:

> "Create `backend/src/app/models.py` with Pydantic models:
>
> - `IntentRequest`: `prompt` (string)
> - `Filter`: `type` (string) and `value` (string)
> - `IntentResponse`: `search_url` (string), `filters` (list of Filter), `raw_query` (string)
> - `Platform` enum: `amazon`, `flipkart`
> - `PlatformIntent`: `platform` (Platform), `search_url` (string), `filters` (list of Filter)
> - `MultiPlatformIntentResponse`: `raw_query` (string), `platforms` (list of PlatformIntent)
> - `Product`: `title`, `price` (float), `rating` (float), `review_count` (int), `image_url`, `product_url`, `platform` (string)
> - `RankRequest`: `query` (string), `products` (list of Product)
> - `RankResponse`: `ranked_products` (list of Product)"

#### 2c. Build the Claude API integration — single-platform (20 min)

Ask Claude Code:

> "Create `backend/src/app/services.py` with a function `extract_intent(prompt: str) -> IntentResponse` that:
>
> 1. Calls Anthropic Claude API using the `anthropic` Python SDK
> 2. Uses model `claude-sonnet-4-5-20250929`
> 3. System prompt instructs Claude to extract shopping intent and return JSON with: `raw_query`, `search_url` (Amazon India `https://www.amazon.in/s?k=...`), `filters` list
> 4. Each filter has `type` (price, brand, delivery, rating, color, size, discount) and `value`
> 5. For delivery, use 'Prime' as the value
> 6. For price, use 'Under ₹X' format
> 7. Strips markdown code fences from Claude's response before JSON parsing
> 8. Uses `ANTHROPIC_API_KEY` from environment
>
> Example — for 'white nike tshirt under 500 fast delivery':
> ```json
> {
>   "raw_query": "white nike tshirt",
>   "search_url": "https://www.amazon.in/s?k=white+nike+tshirt",
>   "filters": [
>     {"type": "brand", "value": "Nike"},
>     {"type": "price", "value": "Under ₹500"},
>     {"type": "delivery", "value": "Prime"},
>     {"type": "color", "value": "White"}
>   ]
> }
> ```"

**Key implementation detail**: Strip markdown code fences (` ```json ... ``` `) from Claude's response before parsing. Claude sometimes wraps JSON in code blocks.

#### 2d. Wire the endpoint (5 min)

Ask Claude Code:

> "Add a `POST /api/intent` endpoint to `backend/src/app/main.py` that:
> - Accepts an `IntentRequest` body
> - Calls `extract_intent(request.prompt)`
> - Returns the `IntentResponse`
> - Wraps errors in HTTPException(500)"

#### 2e. Test manually with curl (5 min)

Ask Claude Code:

> "Start the backend server and test `/api/intent` with:
> 1. 'white nike tshirt under 500 fast delivery'
> 2. 'samsung phone under 15000'
> 3. 'running shoes size 10 under 2000'
>
> Show me the full response for each."

If filters look wrong, iterate on the system prompt in `services.py`.

#### 2f. Write tests (10 min)

Ask Claude Code:

> "Write tests in `backend/tests/`:
> 1. `test_health.py` — test `GET /health` returns 200
> 2. `test_intent.py` — test `POST /api/intent` returns valid response. Mock the Anthropic API call.
> Use pytest and pytest-asyncio with httpx AsyncClient."

Run `cd backend && uv run pytest -v` to verify.

#### 2g. Commit (2 min)

> "Commit the backend code with message 'Add backend API and Chrome extension source code'. Push to origin."

#### Checkpoint (backend done)

- [x] `backend/src/app/main.py` — FastAPI with `/health` and `/api/intent`
- [x] `backend/src/app/models.py` — Pydantic models
- [x] `backend/src/app/services.py` — Claude API integration
- [x] `backend/tests/` — tests passing
- [x] Committed and pushed

---

### Step 1–2.5: Build the Chrome Extension (runs in parallel with backend)

This runs **in parallel** with the backend step. Open a second Claude Code terminal or use sub agents.

#### 3a. Create the Chrome Extension manifest (5 min)

Ask Claude Code:

> "Create `extension/src/manifest.json` for Chrome Extension Manifest V3 with:
> - Name: 'AI Commerce Agent', version: '1.1.0'
> - Permissions: `activeTab`, `scripting`, `sidePanel`, `storage`, `tabs`
> - Host permissions: `https://www.amazon.in/*`, `https://www.flipkart.com/*`
> - Side panel: `default_path` pointing to `sidepanel.html`
> - Background service worker: `background.js`
> - Action: default title 'Open AI Commerce Agent'
>
> **Important**: Do NOT include content_scripts in the manifest — we inject content scripts programmatically via `chrome.scripting.executeScript` from the background service worker."

#### 3b. Create shared types (5 min)

Ask Claude Code:

> "Create `extension/src/types.ts` with TypeScript interfaces:
> - `Filter`: `{ type: string, value: string }`
> - `Product`: `{ title: string, price: number, rating: number, review_count: number, image_url: string, product_url: string, platform: string }`
> - `PlatformIntent`: `{ platform: string, search_url: string, filters: Filter[] }`
> - `MultiPlatformIntentResponse`: `{ raw_query: string, platforms: PlatformIntent[] }`
> - `RankResponse`: `{ ranked_products: Product[] }`"

#### 3c. Build the Side Panel UI (20 min)

**HTML:**

Ask Claude Code:

> "Create `extension/src/sidepanel.html` — a chat-style UI with:
> - Dark header with title 'AI Commerce Agent'
> - Scrollable messages area (chat bubbles)
> - Fixed input area at bottom with textarea and Send button
> - Message types: user (blue, right-aligned), system (gray, left-aligned), error (red), result (green)
> - Area for product carousel (horizontal scroll, cards with images)
> - Script tag loading `sidepanel.js`
> - Clean inline CSS, no frameworks"

**TypeScript:**

Ask Claude Code:

> "Create `extension/src/sidepanel.ts` that:
> 1. On send: displays user message, sends `{ type: 'SEARCH_REQUEST', prompt }` to background via `chrome.runtime.sendMessage`
> 2. Listens for messages from background:
>    - `STATUS` → display as system message
>    - `PRODUCTS` → render product carousel with platform badges (orange #ff9900 for Amazon, blue #2874f0 for Flipkart), images, titles, prices in ₹ format, star ratings, review counts (formatted as '1.5L', '2.3K')
>    - `ERROR` → display as error message
> 3. Auto-scrolls on new messages
> 4. Welcome message on load
> 5. Product cards: 156×156px, horizontal scroll with snap, lazy-loaded images, clickable links opening in new tab"

#### 3d. Build the Background Service Worker (20 min)

This is the orchestration hub. It creates hidden tabs, injects content scripts, and coordinates the full flow.

Ask Claude Code:

> "Create `extension/src/background.ts` that:
>
> 1. On extension icon click: opens side panel via `chrome.sidePanel.open()`
>
> 2. On `SEARCH_REQUEST` message from side panel:
>    a. Send STATUS 'Understanding your request...'
>    b. Call `http://localhost:8000/api/intent/multi` with the prompt (POST, JSON body)
>    c. Send STATUS 'Searching Amazon & Flipkart...'
>    d. For each platform in the response, process in parallel using `Promise.allSettled`:
>       - Apply price filter to the search URL via URL params:
>         - Amazon: append `&rh=p_36%3A-<paise>` (₹ × 100 = paise)
>         - Flipkart: append `&p%5B%5D=facets.price_range.from%3DMin&p%5B%5D=facets.price_range.to%3D<price>`
>       - Create a **hidden tab**: `chrome.tabs.create({ url: modifiedUrl, active: false })`
>       - Wait for tab to finish loading
>       - Inject content script via `chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })`
>       - Apply non-price filters one by one (send `APPLY_ONE_FILTER` messages to content script, waiting for response between each)
>       - Handle navigation: after each filter that causes a page reload, wait for tab load and re-inject content script
>       - Extract products: send `EXTRACT_PRODUCTS` message → get `{ products[] }` back
>       - Apply client-side price constraint as safety net
>       - Close the hidden tab in a `finally` block
>    e. Collect products from all platforms
>    f. Select top 3 per platform, interleave (Amazon, Flipkart, Amazon, Flipkart...)
>    g. Send PRODUCTS message to side panel
>
> 3. Deterministic fallback scoring: `score = (rating × log(reviewCount + 1)) / price`
>
> 4. Error handling:
>    - 45-second timeout on the entire search
>    - Backend unreachable → error with 'Please start the backend server'
>    - API error → 'Try rephrasing your request'
>
> 5. Helper: `applyPriceToUrl(url, filters)` — extracts price filter, modifies URL, returns remaining filters
> 6. Helper: `waitForTabLoad(tabId)` — returns a Promise that resolves when `chrome.tabs.onUpdated` fires with 'complete'"

#### 3e. Create the PlatformAdapter interface (5 min)

Ask Claude Code:

> "Create `extension/src/adapters/types.ts` with a TypeScript interface:
> ```typescript
> export interface PlatformAdapter {
>   platformName: 'amazon' | 'flipkart';
>   waitForFilters(): Promise<boolean>;
>   applyOneFilter(filter: Filter): Promise<boolean>;
>   extractProducts(count: number): Promise<Product[]>;
> }
> ```
> Import `Filter` and `Product` from `../types`."

#### 3f. Build the Content Script with adapter dispatch (10 min)

Ask Claude Code:

> "Create `extension/src/content.ts` that:
> 1. Guards against double-injection with `globalThis.__aiCommerceContent`
> 2. Detects platform from `window.location.hostname`:
>    - `amazon.in` → instantiate `AmazonAdapter`
>    - `flipkart.com` → instantiate `FlipkartAdapter`
> 3. Listens for messages via `chrome.runtime.onMessage`:
>    - `APPLY_FILTERS` (batch) → `adapter.waitForFilters()` then apply each filter one by one → respond with `{ applied[], failed[] }`
>    - `APPLY_ONE_FILTER` (single) → `adapter.applyOneFilter(filter)` → respond with `{ success, filter }`
>    - `EXTRACT_PRODUCTS` → `adapter.extractProducts(count)` → respond with `{ products[] }`"

#### 3g. Stub the Amazon and Flipkart adapters (5 min)

Create stub adapters that will be fleshed out later. Ask Claude Code:

> "Create stub implementations:
> - `extension/src/adapters/amazon.ts` — implements `PlatformAdapter` with `platformName: 'amazon'`, stub methods that return empty results
> - `extension/src/adapters/flipkart.ts` — implements `PlatformAdapter` with `platformName: 'flipkart'`, stub methods that return empty results"

#### 3h. Build and verify (5 min)

> "Run `cd extension && npm run build` and verify `extension/dist/` contains: `manifest.json`, `sidepanel.html`, `background.js`, `content.js`, `sidepanel.js`."

Load `extension/dist/` as unpacked extension in `chrome://extensions/`. Click the icon → Side Panel should open.

#### 3i. Commit (2 min)

> "Commit the extension code. Push to origin."

#### Checkpoint (extension scaffold done)

- [x] `extension/src/manifest.json` — MV3 with sidePanel, scripting, tabs, host permissions for amazon.in and flipkart.com
- [x] `extension/src/types.ts` — shared TypeScript interfaces
- [x] `extension/src/sidepanel.html` + `sidepanel.ts` — chat UI with product carousel support
- [x] `extension/src/background.ts` — service worker with hidden tab orchestration and `Promise.allSettled`
- [x] `extension/src/content.ts` — content script with adapter dispatch
- [x] `extension/src/adapters/types.ts` — `PlatformAdapter` interface
- [x] `extension/src/adapters/amazon.ts` — Amazon adapter stub
- [x] `extension/src/adapters/flipkart.ts` — Flipkart adapter stub
- [x] Extension builds with esbuild, loads in Chrome, side panel opens

---

### Step 2.5–4: Wire End-to-End and Debug

Backend and extension are built separately. Now connect them and debug the full flow.

#### 4a. Start both services (2 min)

1. **Backend**: `cd backend && uv run uvicorn src.app.main:app --reload`
2. **Extension**: `cd extension && npm run build`, then reload in `chrome://extensions/`

#### 4b. First end-to-end test (10 min)

1. Open Chrome with the extension loaded
2. Click the extension icon → Side Panel opens
3. Type: **"white nike tshirt under 500"**
4. Click Send

**Expected flow**:
- Side panel: "Understanding your request..."
- Side panel: "Searching Amazon & Flipkart..."
- Hidden tabs open for Amazon and Flipkart (you won't see them — they're `active: false`)
- Side panel: shows product carousel

**Common issues and fixes**:

| Issue | Symptom | Fix |
|-------|---------|-----|
| Backend not reachable | Error after "Understanding your request..." | Check backend running on port 8000, check CORS middleware |
| JSON parse error | 500 from backend | Claude API wraps JSON in markdown code fences — strip them in `services.py` |
| Content script not injected | No products returned | Check `chrome.scripting.executeScript` in background.ts, verify host_permissions in manifest |
| Hidden tab blocked | Tab creation fails | Ensure `tabs` permission in manifest |
| Page reload after filter click | Filter application breaks | Background script must detect tab load events and re-inject content script |
| CORS error | Network error in service worker | Verify FastAPI CORS middleware allows all origins |

#### 4c. Fix JSON parsing (5 min)

Claude API often wraps JSON responses in markdown code fences. Ask Claude Code:

> "Update `backend/src/app/services.py` to strip markdown code fences from Claude's response before parsing JSON. Handle both \`\`\`json and plain \`\`\` wrappers."

#### 4d. Fix page reload handling (20 min)

When Amazon/Flipkart applies a filter, the page reloads. The background service worker must handle this.

Ask Claude Code:

> "Update `extension/src/background.ts` to handle page reloads during filter application:
> 1. After sending `APPLY_ONE_FILTER` to the content script, check if the tab navigated (URL changed or tab reloaded)
> 2. If the tab reloaded, wait for it to finish loading using `chrome.tabs.onUpdated`
> 3. Re-inject the content script via `chrome.scripting.executeScript`
> 4. Continue with the next filter
>
> Use a helper function `waitForTabLoad(tabId)` that returns a Promise resolving when the tab status is 'complete'."

#### 4e. Polish status messages (10 min)

Ask Claude Code:

> "Update the side panel to show more descriptive status messages during the flow:
> - 'Understanding your request...'
> - 'Searching Amazon & Flipkart...'
> - Show applied/failed filter counts
> - Show product count per platform
> - Handle error states gracefully with user-friendly messages"

Rebuild and reload after each fix.

#### 4f. Commit (2 min)

> "Commit with message 'Wire end-to-end flow with page reload handling and UX polish'. Push."

#### Checkpoint (end-to-end working)

- [x] Backend and extension connected
- [x] JSON parsing handles Claude's markdown code fences
- [x] Page reload handling works for filter application
- [x] Status messages show progress in side panel
- [x] Basic flow works end-to-end (even if filters are rough)
- [x] Committed and pushed

---

### Step 4–5: GitHub Actions CI, MCP Server, Playwright Test Flow

Three tasks that can be done in any order.

#### 5a. Create the CI workflow (10 min)

Ask Claude Code:

> "Create `.github/workflows/ci.yml` — a GitHub Actions CI pipeline:
>
> - Triggers on push to `main` and `feature/*`, and pull requests to `main`
>
> **Job: backend** (ubuntu-latest)
> - Checkout (actions/checkout@v4)
> - Install uv (astral-sh/setup-uv@v4)
> - Setup Python 3.12 (actions/setup-python@v5)
> - `cd backend && uv sync`
> - `cd backend && uv run ruff check .`
> - `cd backend && uv run pytest -v`
>
> **Job: extension** (ubuntu-latest)
> - Checkout (actions/checkout@v4)
> - Setup Node 20 (actions/setup-node@v4, cache npm)
> - `cd extension && npm ci`
> - `cd extension && npm run build`
> - Verify dist files: `test -f extension/dist/background.js && test -f extension/dist/content.js && test -f extension/dist/sidepanel.js && test -f extension/dist/manifest.json && test -f extension/dist/sidepanel.html`"

Push and verify green build on GitHub Actions.

#### 5b. Create the custom MCP server (15 min)

Ask Claude Code:

> "Create `backend/mcp_server.py` — an MCP server using the `mcp` Python package (FastMCP) that exposes two tools:
>
> 1. `extract_shopping_intent(prompt: str)` — calls `extract_intent()` from services.py, returns JSON with `search_url`, `filters[]`, `raw_query`
> 2. `extract_multi_platform_shopping_intent(prompt: str)` — calls `extract_multi_platform_intent()` from services.py, returns JSON with `raw_query`, `platforms[]` (each with `platform`, `search_url`, `filters[]`)
>
> Use stdio transport. Load environment variables from `.env`.
> Add docstrings to both tools describing their inputs and outputs."

Register with Claude Code:

> "Run: `claude mcp add --transport stdio commerce-agent -- uv run --directory /Users/saurabh.karmakar/pythonProjects/aicommerceanalysis/backend python mcp_server.py`"

Restart Claude Code, then test:

> "Use the extract_multi_platform_shopping_intent tool for 'white nike tshirt under 500 fast delivery'."

#### 5c. Upgrade /test-flow with Playwright (10 min)

Now that Playwright MCP is available, upgrade the skill.

Ask Claude Code:

> "Update `.claude/skills/test-flow/SKILL.md` to include Playwright browser testing:
>
> - Frontmatter: add `mcp__playwright__browser_navigate`, `mcp__playwright__browser_snapshot`, `mcp__playwright__browser_click`, `mcp__playwright__browser_evaluate`, `mcp__playwright__browser_close`, `mcp__playwright__browser_take_screenshot` to allowed-tools
>
> - **Phase 1** (unchanged): API health + curl smoke test
> - **Phase 2** (new): Navigate to `http://localhost:8000/docs`, expand POST /api/intent, click 'Try it out', enter test JSON, click Execute, validate 200 response
> - **Phase 3** (new): Extract search_url from the response, navigate to it, verify Amazon results page loads, save screenshot as `test-amazon-results.png`
> - **Phase 4** (new): Close browser, print pass/fail summary table"

#### 5d. Commit (2 min)

> "Commit with message 'Add GitHub Actions CI with parallel backend and extension jobs'. Push."

Then separately:

> "Commit MCP server: 'Add custom MCP server wrapping intent extraction API'. Push."

> "Commit skill upgrade: 'Upgrade test-flow skill with Playwright browser testing'. Push."

#### Checkpoint (CI + MCP + Skills done)

- [x] `.github/workflows/ci.yml` — two parallel jobs, green build
- [x] `backend/mcp_server.py` — custom MCP with 2 tools
- [x] `/test-flow` upgraded with 4-phase Playwright testing
- [x] All committed and pushed

---

### Step 5–6: Harden Amazon — 4-Strategy Filter Cascade

The Amazon adapter needs robust filter matching. Amazon's DOM structure varies by category and locale.

#### 6a. Implement the 4-strategy filter cascade (30 min)

Ask Claude Code:

> "Implement the full Amazon adapter in `extension/src/adapters/amazon.ts`:
>
> **`waitForFilters()`**: Poll for `#s-refinements` element (20 attempts, 500ms each).
>
> **`applyOneFilter(filter)`**: Try 4 strategies in order until one succeeds:
>
> 1. **tryAriaLabelMatch** — Match links by `aria-label` attribute:
>    - Price: match 'up to ₹X'
>    - Brand: match 'apply the filter X to narrow results'
>    - Delivery: match 'get it today', 'get it by tomorrow', 'free shipping'
>    - Rating: match 'X stars & up'
>
> 2. **tryScopedSectionMatch** — Find filter section by known Amazon section IDs:
>    - `brandsRefinements`, `priceRefinements`, `deliveryRefinements`, `reviewsRefinements`, `sizeRefinements`, `size_two_browse`, `pct-off`
>    - Search within the section for matching text
>
> 3. **tryFullSidebarScan** — Scan all links in `#s-refinements` by text content (case-insensitive)
>
> 4. **tryExpandAndRetry** — Click 'See more' expanders for brand/size/color sections, then retry strategies 1-3
>
> **`extractProducts(count)`**:
> - Select `div[data-component-type='s-search-result']`
> - Skip sponsored results (links containing `/sspa/`)
> - Extract: title (from `h2`), price (`.a-price-whole`, remove commas), rating (`i.a-icon-star-small span`), review count, image (`img.s-image`), product URL (prefer `/dp/` link)
> - Indian number format: handle '1,00,000' style"

Rebuild and test on Amazon search pages.

#### 6b. Verify price via URL params (10 min)

Ask Claude Code:

> "Verify that `extension/src/background.ts` correctly applies price filters to Amazon URLs:
> - For 'Under ₹500': append `&rh=p_36%3A-50000` (500 × 100 = 50000 paise)
> - The format is `rh=p_36%3A-<paise>` where paise = rupees × 100
> - Test with `console.log` that the URL is correctly modified"

#### 6c. Test on live Amazon pages (15 min)

Test these prompts:

| Prompt | Key filter | What to verify |
|--------|-----------|---------------|
| "white nike tshirt under 500 fast delivery" | Brand + Price + Delivery | Nike brand checked, price in URL, Prime filter applied |
| "samsung phone under 15000" | Brand + Price | Samsung checked, price range correct in URL |
| "laptop bag under 1000" | Price | Price in URL, products returned |
| "running shoes size 10 under 2000" | Size + Price | Size filter via "See more" expansion |

Fix issues as they arise — the 4-strategy cascade should handle most cases.

#### 6d. Commit (2 min)

> "Commit: 'Improve content script filter matching with 4-strategy cascade'. Push."

#### Checkpoint (hardened Amazon)

- [x] Amazon adapter: 4-strategy filter cascade (aria-label → scoped section → full sidebar → expand & retry)
- [x] Price filters via URL params (paise encoding)
- [x] Product extraction skips sponsored results
- [x] Tested across 3+ product categories
- [x] Committed and pushed

---

### Step 6–7: Multi-Platform Pivot — Flipkart Adapter + Hidden Tabs

This is where the project expands from Amazon-only to Amazon + Flipkart.

#### 7a. Add multi-platform intent extraction (15 min)

Ask Claude Code:

> "Add `extract_multi_platform_intent(prompt: str) -> MultiPlatformIntentResponse` to `backend/src/app/services.py`:
>
> 1. Uses model `claude-sonnet-4-5-20250929`
> 2. System prompt instructs Claude to return JSON for **both** Amazon and Flipkart:
>    - Same `raw_query` for both
>    - Platform-specific search URLs:
>      - Amazon: `https://www.amazon.in/s?k=<query>`
>      - Flipkart: `https://www.flipkart.com/search?q=<query>`
>    - Platform-specific delivery filters:
>      - Amazon: `{ type: 'delivery', value: 'Prime' }`
>      - Flipkart: `{ type: 'delivery', value: 'Flipkart Assured' }`
>    - All other filters identical across platforms
>
> Also add `POST /api/intent/multi` endpoint to `main.py`."

#### 7b. Implement the Flipkart adapter (30 min)

Ask Claude Code:

> "Implement the full Flipkart adapter in `extension/src/adapters/flipkart.ts`:
>
> **`waitForFilters()`**: Poll for product cards — `div[data-id]` or `a[href*='/p/']` (20 attempts, 500ms each).
>
> **`applyOneFilter(filter)`**: Try 3 strategies:
>
> 1. **tryCheckboxFilter** — Match by `div[title]` or `label` text:
>    - Brand: case-insensitive exact match
>    - Rating: match '4★ & above'
>    - Color/Size: direct text match
>    - Delivery: match 'flipkart assured' (case-insensitive)
>    - Click the checkbox or label
>
> 2. **tryPriceFilter** — For price type:
>    - Find `<select>` elements
>    - Match option text to price number
>    - Click 'Go' button if present
>    - Fallback: navigate to URL with `p[]=facets.price_range.from=Min&p[]=facets.price_range.to=<amount>`
>
> 3. **tryTextFallback** — Text-based match in sidebar
>
> **`extractProducts(count)`**:
> - Try `div[data-id]` first, then dynamically find cards via `a[href*='/p/']` links
> - Use LCA (Lowest Common Ancestor) algorithm to group links into product cards and avoid duplicates
> - Support two layouts:
>   - **Grid** (fashion): title in `a.atJtCj`, `a.WKTcLC`
>   - **List** (electronics): title in `div.RG5Slk`
> - Price: search for `₹X,XXX` pattern (first = sale price) — class-based (`div.hZ3P6w`, `div.Nx9bqj`) or structural scan
> - Rating: class-based (`div.MKiFS6`, `span.CjyrHS`) or structural scan for `[\\d.]+` in 1-5 range
> - Image: prefer `flixcart` or `rukminim` CDN URLs
> - Product URL: `a[href*='/p/']`"

#### 7c. Update background service worker for hidden tabs (15 min)

If not already done, verify the background service worker creates hidden tabs per platform:

Ask Claude Code:

> "Verify `extension/src/background.ts`:
> - Calls `/api/intent/multi` (not `/api/intent`)
> - Creates hidden tabs with `chrome.tabs.create({ url, active: false })` for each platform
> - Processes platforms in parallel with `Promise.allSettled`
> - Closes hidden tabs in `finally` blocks
> - Interleaves products from both platforms for the carousel"

#### 7d. Add product ranking (10 min)

Ask Claude Code:

> "Add `rank_products(query: str, products: list[Product]) -> list[Product]` to `backend/src/app/services.py`:
>
> 1. If ≤5 products, return as-is
> 2. Call Claude API with a system prompt asking to rank the best 5 by relevance, value, ratings, and platform diversity
> 3. Expect JSON: `{ indices: [0, 3, 1, 4, 2] }`
> 4. Validate indices are within bounds
> 5. **Deterministic fallback** if LLM fails: `score = (rating × log(reviewCount + 1)) / price`, return top 5 sorted descending
>
> Also add `POST /api/rank` endpoint to `main.py`."

#### 7e. Test dual-platform flow (10 min)

1. Start backend
2. Rebuild extension
3. Type: "white tshirt under 500 fast delivery"
4. Verify both Amazon and Flipkart tabs open (hidden)
5. Verify products from both platforms appear in carousel

#### 7f. Commit (2 min)

> "Commit: 'Add multi-platform product comparison with in-panel carousel'. Push."

#### Checkpoint (multi-platform working)

- [x] `/api/intent/multi` returns per-platform intents
- [x] Flipkart adapter: checkbox filters, price via URL params, product extraction with LCA
- [x] Hidden background tabs for parallel platform processing
- [x] Product carousel shows both Amazon and Flipkart results
- [x] Committed and pushed

---

### Step 7–8: Product Extraction, Flipkart Fixes, and Demo Prep

#### 8a. Fix Flipkart product extraction (20 min)

Flipkart's DOM is less stable than Amazon's. Common issues:

| Issue | Symptom | Fix |
|-------|---------|-----|
| No products extracted | Empty array returned | Flipkart uses different selectors for grid vs list layouts — support both |
| Wrong prices | Prices are 0 or NaN | Flipkart shows MRP and sale price — use structural scan for `₹` pattern, take first match |
| Missing images | No images in carousel | Flipkart lazy-loads images — look for `flixcart` or `rukminim` CDN URLs in `src` and `data-src` |
| Duplicate products | Same product appears twice | LCA algorithm groups `a[href*='/p/']` links — ensure deduplication by href |
| Delivery filter fails | "Flipkart Assured" not clicked | Match case-insensitively, look for `div[title]` with "Flipkart Assured" text |

Ask Claude Code to fix each issue as it arises.

#### 8b. Fix price filter for Flipkart (10 min)

Ask Claude Code:

> "Verify Flipkart price filter via URL params:
> - Format: `&p%5B%5D=facets.price_range.from%3DMin&p%5B%5D=facets.price_range.to%3D<price>`
> - Example for 'Under ₹500': `&p%5B%5D=facets.price_range.from%3DMin&p%5B%5D=facets.price_range.to%3D500`
> - Verify this is applied in `background.ts` before tab creation"

#### 8c. End-to-end testing with demo prompts (15 min)

Test these prompts and pick the best 2-3 for the demo:

| Prompt | Expected | Notes |
|--------|----------|-------|
| "white tshirt under 500 with fast delivery" | Both platforms show filtered results, carousel with 6 products | Main demo prompt |
| "samsung phone under 15000" | Electronics layout (list) on Flipkart, grid on Amazon | Cross-category test |
| "running shoes under 2000" | Shoes from both platforms | Good visual cards |
| "blue jeans under 1000" | Clothing from both platforms | Fashion category |

#### 8d. Commit final fixes (2 min)

> "Commit: 'Fix Flipkart product extraction and price filter'. Push."

#### 8e. Prepare demo environment (10 min)

1. Close unnecessary Chrome tabs
2. Start backend: `cd backend && uv run uvicorn src.app.main:app --reload`
3. Rebuild extension: `cd extension && npm run build`
4. Reload extension in `chrome://extensions/`
5. Open Claude Code in a terminal side by side with Chrome
6. Clear Claude Code conversation with `/clear`
7. Pre-open GitHub Actions page to show green builds

#### 8f. Practice the demo script (15 min)

**Part 1: The Product (2 min)**

1. Show Chrome with the extension loaded
2. Click the extension icon → Side Panel opens
3. Type: **"white tshirt under 500 with fast delivery"**
4. Watch: intent → hidden tabs → filters → products in carousel
5. Point out: Amazon (orange badges) and Flipkart (blue badges) results interleaved

**Part 2: Claude Code Features (3-4 min)**

| Feature | What to show | Time |
|---------|-------------|------|
| **MCP Servers** | Ask Claude Code: "Use the extract_multi_platform_shopping_intent tool for running shoes under 2000" | 30s |
| **GitHub Actions** | Show green build, point out parallel backend + extension jobs | 20s |
| **Sub Agents** | Show git history where backend and extension commits interleave | 20s |
| **Hooks** | Edit a Python file → "Auto-formatting..." appears. Submit prompt → "Running lint checks..." | 20s |
| **Skills** | Run `/test-flow` → watch 4-phase test with Playwright browser automation | 30s |
| **Sandboxing** | Ask Claude Code to delete files → deny permission prompt | 20s |
| **Parallel Claude + CLAUDE.md** | Explain dual instances sharing `CLAUDE.md` context | 15s |

**Part 3: Architecture (1 min)**

- "Side panel sends prompt to FastAPI backend"
- "Backend calls Claude API to extract intent for both Amazon and Flipkart"
- "Extension opens hidden tabs, applies filters via adapters, extracts products"
- "Products ranked and displayed in an interleaved carousel"
- "All deterministic — LLM decides what, code decides how"

#### 8g. Record a backup (5 min)

Record a screen capture of the working demo (QuickTime on macOS). If the live demo breaks, switch to the recording.

#### Final Checkpoint

- [x] Backend running with `/api/intent`, `/api/intent/multi`, `/api/rank`
- [x] Extension loaded with Amazon + Flipkart adapters
- [x] Full flow: prompt → dual-platform search → filter application → product extraction → ranked carousel
- [x] 2-3 reliable demo prompts tested
- [x] All 7 Claude Code features ready to demonstrate
- [x] GitHub Actions green build
- [x] Backup recording saved
- [x] All committed and pushed

---

## What Was Built (Retrospective)

### Phase 1: Single-Platform Foundation
- Chrome MV3 extension with side panel chat UI
- FastAPI backend with `/api/intent` endpoint
- Claude API integration for intent extraction
- Content script that parses Amazon's `#s-refinements` sidebar
- Filter application via DOM clicks on Amazon

### Phase 2: Price Filter Reliability
- Moved price filter from DOM clicks to URL parameters
- Amazon: `rh=p_36%3A-<paise>` encoding
- Flipkart: `facets.price_range` query params

### Phase 3: Multi-Platform Expansion
- `PlatformAdapter` interface (`waitForFilters`, `applyOneFilter`, `extractProducts`)
- Flipkart adapter with structural selectors and checkbox filters
- `/api/intent/multi` endpoint returning per-platform intents
- Delivery filter mapping: Amazon → "Prime", Flipkart → "Flipkart Assured"
- Hidden background tabs for parallel platform processing

### Phase 4: Product Extraction & Comparison
- Product extraction from both platforms (title, price, rating, reviews, image, URL)
- `/api/rank` endpoint with LLM ranking + deterministic fallback
- Interleaved product carousel in side panel
- Platform badges and formatted review counts

### Key Deviations from Original Plan
- **Scope expanded**: From Amazon-only to Amazon + Flipkart with comparison
- **Build tool**: esbuild instead of Vite for extension bundling
- **Hidden tabs**: Instead of using the active tab, the extension creates hidden background tabs
- **Product extraction**: Originally out of scope, implemented for comparison feature
- **No content script in manifest**: Scripts are injected programmatically via `chrome.scripting.executeScript`

---

## Out of Scope (Not Built)

- Personalization (no Redis, Neo4j, or Vector DB)
- Cart, checkout, or payment flows
- User accounts or authentication
- Docker / Kubernetes deployment
- Product detail page extraction (only search results)
- More than 2 platforms (e.g., Myntra, Ajio)
- Persistent chat history

---

## Potential Future Work

- **More platforms**: Myntra, Ajio — the adapter pattern makes this straightforward
- **Better empty-state UX**: Handle zero-match scenarios (e.g., "no Nike tshirts under ₹200")
- **Product detail extraction**: Scrape individual product pages for specs, reviews
- **Result caching**: Avoid re-searching for identical queries
- **Streaming status updates**: Real-time progress as each platform loads

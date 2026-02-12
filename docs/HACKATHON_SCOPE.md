# Hackathon Scope — AI Commerce Agent (8 Hours)

## What We're Building

A Chrome Extension with a Side Panel chat interface. The user opens any Chrome tab, clicks the extension icon, types something like *"white Nike t-shirt under 500, fast delivery"*, and the agent:

1. Understands the intent (via Claude API)
2. Opens Amazon India search results in the active tab
3. Reads the available filters from the page
4. Applies the right filters automatically
5. Reports back in the side panel what it did

**One platform only**: Amazon India.
**One flow only**: Search + filter application. No cart, no checkout, no comparison.

---

## Architecture (Minimal)

```
┌─────────────────────────────────────────────┐
│  Chrome Extension (MV3)                     │
│                                             │
│  Side Panel ←→ Service Worker ←→ Content    │
│  (Chat UI)     (Coordinator)    Script      │
│                     │            (DOM ops)   │
└─────────────────────┼───────────────────────┘
                      │ HTTP
                      ▼
              ┌───────────────┐
              │  FastAPI       │
              │  (single      │
              │   endpoint)   │
              │       │       │
              │  Claude API   │
              └───────────────┘
```

### Extension Components

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest with sidePanel, activeTab, scripting permissions |
| `sidepanel.html` + `sidepanel.ts` | Chat UI — input box, message bubbles, status indicators |
| `background.ts` | Service Worker — routes messages between side panel, content script, and backend |
| `content.ts` | Content script — injects into Amazon pages, parses filters from DOM, clicks filter elements |

### Backend

Single FastAPI app with one endpoint:

```
POST /api/intent
Body: { "prompt": "white nike tshirt under 500 fast delivery" }
Response: {
  "search_url": "https://www.amazon.in/s?k=white+nike+tshirt",
  "filters": [
    { "type": "price", "value": "under-500" },
    { "type": "delivery", "value": "prime" },
    { "type": "brand", "value": "Nike" }
  ]
}
```

Claude API does the heavy lifting in one call — intent extraction, search URL generation, and filter plan all in a single structured output.

### Content Script Filter Strategy

Keep it simple — no adapter framework, no normalizer. The content script:

1. Waits for Amazon search page to load
2. Finds the filter sidebar (`#s-refinements`)
3. For each filter in the plan, searches for matching text in filter labels
4. Clicks the matching checkbox/link
5. Waits for page to stabilize between clicks
6. Reports back what it applied and what it couldn't find

---

## Claude Code Features to Demonstrate

These are about **how we build** the project, not what the project does.

### 1. MCP Servers

Set up and use MCP servers during development:

- **Filesystem MCP** — for file operations during development
- **Custom Commerce Agent MCP** — wrap the FastAPI backend as an MCP server so Claude Code can directly invoke the intent API as a tool during testing and debugging. This shows MCP as both a development tool and a potential integration pattern.

### 2. GitHub Actions

- Initialize a GitHub repo and push
- Create a CI workflow (`.github/workflows/ci.yml`) that:
  - Lints Python (ruff) and TypeScript (eslint)
  - Runs backend pytest tests
  - Builds the Chrome extension with Vite
- Trigger it with a push and show the green check

### 3. Sub Agents

During development, use Claude Code sub agents to parallelize work:

- One agent builds the backend (FastAPI + Claude API integration)
- Another agent builds the extension scaffold (manifest, side panel, service worker, content script)
- A third agent writes tests

Show the parallel execution in the Claude Code session.

### 4. Hooks

Configure Claude Code hooks (`.claude/hooks.json`):

- **Pre-commit hook**: Run `ruff check` on Python files and `eslint` on TypeScript files before every commit
- **Post-file-edit hook**: Auto-format with `ruff format` / `prettier` after Claude Code edits a file
- Show a hook catching a lint error and Claude Code fixing it

### 5. Skills + Plugins

- **Custom Skill**: Create **`/test-flow`** — Runs an end-to-end test: sends a sample prompt to the backend, validates the structured response
- **Plugins**: Install 1-2 pre-built plugins from the official Anthropic marketplace via `/plugin` → Discover tab (e.g., code intelligence, GitHub integration)
- **Demo point**: Skills = custom project-specific commands; Plugins = pre-built from marketplace

### 6. Sandboxing

- Demonstrate that Claude Code runs commands in a sandboxed environment
- Show the permission prompts when Claude Code attempts to run potentially risky operations
- Show how sandboxing prevents accidental file system damage during development

### 7. Parallel Claude

- Run multiple Claude Code instances simultaneously:
  - Instance 1: Working on backend code
  - Instance 2: Working on extension code
- Show how CLAUDE.md and project context keeps both instances aligned
- Demonstrate merging their work together

---

## Time Plan

| Hours | What | Claude Code Features Used |
|-------|------|--------------------------|
| **0–0.5** | Git init, repo setup, CLAUDE.md update, install deps (`uv init`, `npm init`) | GitHub repo setup |
| **0.5–1** | Configure Claude Code: hooks, skills, MCP servers | Hooks, Skills, MCP |
| **1–2.5** | Build backend: FastAPI endpoint + Claude API prompt engineering + tests | Sub agents (parallel with extension) |
| **1–2.5** | Build extension: manifest, side panel chat UI, service worker, content script | Parallel Claude, Sub agents |
| **2.5–4** | Wire end-to-end: side panel → backend → content script filter application | — |
| **4–5** | Test on Amazon India with real prompts, fix DOM parsing edge cases | Skills (/test-flow) |
| **5–5.5** | GitHub Actions CI pipeline | GitHub Actions |
| **5.5–6** | Wrap backend as custom MCP server | MCP Servers |
| **6–7** | End-to-end polish, handle errors gracefully, improve chat UX | Sandboxing demo |
| **7–8** | Prepare demo: 3 compelling example prompts, rehearse, record if needed | All features recap |

---

## What's Explicitly Out of Scope

- Flipkart or any other platform
- Personalization (no Redis, Neo4j, Vector DB)
- Cart, checkout, payment
- Cross-platform comparison
- Adapter framework abstraction
- Docker / Kubernetes
- User accounts or authentication
- Production deployment

---

## Demo Script (2 minutes)

1. Open Chrome with the extension loaded
2. Navigate to amazon.in (or start on a blank tab)
3. Click the extension icon → Side Panel opens
4. Type: *"I want a white Nike t-shirt under 500 rupees with fast delivery"*
5. Watch the side panel show progress:
   - "Understanding your request..."
   - "Searching Amazon India..."
   - "Applying filters: Brand: Nike, Price: Under ₹500, Delivery: Prime"
6. The Amazon tab now shows filtered results
7. Side panel shows: "Done — 3 filters applied, 24 results found"

Then flip to Claude Code and walk through: MCP config, hooks in action, custom skills, GitHub Actions green build, sub agent usage, parallel development, and sandboxing.

---

## Detailed Plan

### Step 0–0.5: Git Init, Repo Setup, CLAUDE.md Update, Install Deps

This step sets up the project foundation. You'll work in your terminal and Claude Code side by side.

#### 0a. Initialize Git (2 min)

Open your terminal in the project directory and run:

```bash
cd ~/pythonProjects/aicommerceanalysis
git init
```

Then create a `.gitignore`. You can ask Claude Code to do this for you. Open Claude Code and type:

> "Create a .gitignore for a project that has a Python backend (uv, pytest, ruff) and a TypeScript Chrome Extension (node_modules, dist). Include macOS .DS_Store, .env files, and IDE folders."

Claude Code will create the file. Review it and approve.

#### 0b. Create the Monorepo Directory Structure (3 min)

Ask Claude Code:

> "Create the following empty directory structure for the project:
> - `backend/` — Python FastAPI backend
> - `backend/src/app/` — application code
> - `backend/tests/` — pytest tests
> - `extension/` — Chrome Extension
> - `extension/src/` — extension source code
> - `extension/tests/` — extension tests"

Claude Code will create the directories and any necessary placeholder files.

#### 0c. Initialize the Python Backend with uv (5 min)

Ask Claude Code:

> "Initialize a Python project in the `backend/` directory using `uv init`. Then add these dependencies:
> - Runtime: fastapi, uvicorn[standard], pydantic, anthropic, python-dotenv
> - Dev: pytest, pytest-asyncio, httpx, ruff
>
> Set the Python version to 3.12. Set the project name to `ai-commerce-backend`."

Claude Code will run `uv init` inside `backend/` and then `uv add` for each dependency. It will ask permission before running each shell command — **approve them**. This creates:

- `backend/pyproject.toml` — project config and dependencies
- `backend/uv.lock` — locked dependency versions
- `backend/.python-version` — Python version pin

**What to watch for**: If `uv` is not installed, Claude Code may try to install it. Approve that too, or install it yourself with `curl -LsSf https://astral.sh/uv/install.sh | sh`.

#### 0d. Initialize the Chrome Extension with npm (5 min)

Ask Claude Code:

> "Initialize a Node.js project in the `extension/` directory using `npm init -y`. Then install:
> - Dev dependencies: typescript, vite, @types/chrome, vitest, eslint, prettier
>
> Set the project name to `ai-commerce-extension`. Create a basic tsconfig.json with strict mode enabled, targeting ES2020 with module ESNext."

This creates:

- `extension/package.json` — project config and dependencies
- `extension/node_modules/` — installed packages (ignored by git)
- `extension/tsconfig.json` — TypeScript config

#### 0e. Create a .env.example (2 min)

Ask Claude Code:

> "Create a `.env.example` file at the project root with these placeholder variables:
> ```
> ANTHROPIC_API_KEY=your-api-key-here
> BACKEND_PORT=8000
> ```
> Also create an actual `.env` file with the same content. I'll fill in my real API key."

After Claude Code creates it, open `.env` in your editor and paste your real Anthropic API key. **Never commit the `.env` file** — it should already be in `.gitignore`.

#### 0f. Update CLAUDE.md (3 min)

Ask Claude Code:

> "Update CLAUDE.md to reflect the hackathon scope. Add a section called 'Development Commands' with:
> - Backend: `cd backend && uv run uvicorn src.app.main:app --reload` to run the server
> - Backend tests: `cd backend && uv run pytest`
> - Backend lint: `cd backend && uv run ruff check .`
> - Extension build: `cd extension && npm run build`
> - Extension tests: `cd extension && npx vitest`
> - Extension lint: `cd extension && npx eslint src/`
>
> Also note that this is a hackathon prototype — Amazon India only, search + filters only."

#### 0g. Push to GitHub (3 min)

The GitHub repo already exists at `https://github.com/piyushtechproduct/anthropic-hackathon.git`. Ask Claude Code:

> "Create an initial git commit with everything we have so far. Then add the remote origin `https://github.com/piyushtechproduct/anthropic-hackathon.git` and push to it."

Claude Code will:
1. Stage the files (`git add`)
2. Create the commit
3. Run `git remote add origin https://github.com/piyushtechproduct/anthropic-hackathon.git`
4. Push with `git push -u origin main`

**What to watch for**: Claude Code will ask permission before running `git push`. This is an external action — review and approve.

#### Checkpoint (0.5 hours done)

At this point you should have:

- [x] Git repo initialized with `.gitignore`
- [x] `backend/` with `pyproject.toml`, dependencies installed via uv
- [x] `extension/` with `package.json`, `tsconfig.json`, dependencies installed via npm
- [x] `.env.example` and `.env` with your API key
- [x] Updated `CLAUDE.md` with dev commands
- [x] Pushed to `https://github.com/piyushtechproduct/anthropic-hackathon.git`
- [x] Clean directory structure ready for code

Run `git log --oneline` and `ls -la backend/ extension/` to verify everything is in place before moving on.

### Step 0.5–1: Configure Claude Code Hooks, Skills, and MCP Servers

This step sets up Claude Code tooling that you'll demonstrate during the hackathon. These are configurations for **how Claude Code works in this project**, not application code.

#### 1a. Create the .claude directory structure (1 min)

Ask Claude Code:

> "Create the following directory structure under `.claude/`:
> - `.claude/hooks/` — for hook scripts
> - `.claude/skills/test-flow/` — for the /test-flow skill"

#### 1b. Set up Hooks (10 min)

Claude Code hooks run shell commands in response to events (like editing a file or submitting a prompt). We'll set up two hooks:

**Hook 1: Auto-format after file edits**

Ask Claude Code:

> "Create a hook script at `.claude/hooks/auto-format.sh` that:
> - Reads JSON from stdin to get the file path (from `tool_input.file_path` using jq)
> - If the file is `.py`, runs `ruff format` on it
> - If the file is `.ts`, `.tsx`, `.js`, or `.jsx`, runs `npx prettier --write` on it
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
> Use `$CLAUDE_PROJECT_DIR` in the command paths so they work regardless of working directory."

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
  }
}
```

**How to verify**: Edit any `.py` file via Claude Code — you should see "Auto-formatting..." appear after the edit. Submit any prompt — you should see "Running lint checks..." briefly.

#### 1c. Set up Custom Skill — /test-flow (5 min)

Skills are custom slash commands you create. Each skill is a `SKILL.md` file with YAML frontmatter and markdown instructions. We'll create one custom skill to demonstrate the feature.

Ask Claude Code:

> "Create `.claude/skills/test-flow/SKILL.md` with:
> - Frontmatter: name `test-flow`, description 'Run an end-to-end test of the commerce agent flow', user-invocable true, allowed-tools `Bash, Read, Write`
> - Instructions: Send a sample prompt ('white nike tshirt under 500 fast delivery') to the backend API at `http://localhost:8000/api/intent` using curl. Validate the response has `search_url` and `filters` fields. Report pass/fail with the response body."

The file should look like:

```markdown
---
name: test-flow
description: Run an end-to-end test of the commerce agent flow
user-invocable: true
allowed-tools: Bash, Read, Write
---

# End-to-End Test Flow

## Steps

1. Verify the backend is running at `http://localhost:8000/health`
2. Send a test request:
   ```bash
   curl -s -X POST http://localhost:8000/api/intent \
     -H "Content-Type: application/json" \
     -d '{"prompt": "white nike tshirt under 500 fast delivery"}'
   ```
3. Validate the response contains `search_url` and `filters` fields
4. Report pass/fail with the full response body
```

**How to verify**: Type `/test-flow` in Claude Code — it should appear in the autocomplete menu. (It won't fully work yet since we haven't built the backend, but it should be recognized.)

#### 1d. Install a Plugin from the Marketplace (5 min)

Plugins are pre-built extensions from Anthropic and the community. This demonstrates the **Plugins** feature separately from Skills.

Run the following in Claude Code:

> `/plugin`

This opens the plugin browser. Go to the **Discover** tab to see available plugins. Install one or two relevant ones, for example:

- A **code intelligence** plugin (LSP for Python or TypeScript) — gives Claude Code deeper understanding of your code
- A **GitHub integration** plugin — if available, enhances PR/issue workflows

Alternatively, if you know the plugin name, install directly:

> `/plugin install <plugin-name>@claude-plugins-official`

**What to watch for**: Plugins may require a Claude Code restart to take effect. If prompted, restart.

**Why this matters for the demo**: You can show the audience both:
- **Plugins** = pre-built from marketplace (installed via `/plugin`)
- **Skills** = custom project-specific commands (created as `SKILL.md`)

#### 1d. Set up MCP Servers (8 min)

MCP (Model Context Protocol) servers give Claude Code access to external tools. We'll set up a filesystem MCP server now. The custom commerce agent MCP server will be built later (step 5.5–6).

**Filesystem MCP Server**

Ask Claude Code:

> "Add a filesystem MCP server to this project. Run:
> ```
> claude mcp add --transport stdio filesystem -- npx -y @modelcontextprotocol/server-filesystem /Users/saurabh.karmakar/pythonProjects/aicommerceanalysis
> ```
> This gives Claude Code file system tools scoped to the project directory."

**What to watch for**: Claude Code will ask permission the first time an MCP server is used. Approve it.

**Verify MCP setup**

Ask Claude Code:

> "Run `claude mcp list` to show all configured MCP servers."

You should see the `filesystem` server listed.

#### 1e. Commit the configuration (2 min)

Ask Claude Code:

> "Commit the `.claude/` configuration (hooks, skills, settings) with message 'Add Claude Code hooks, skills, and MCP config'. Then push to origin."

#### Checkpoint (1 hour done)

At this point you should have:

- [x] `.claude/hooks/auto-format.sh` — auto-formats Python and TypeScript files after edits
- [x] `.claude/hooks/lint-check.sh` — runs ruff + eslint on prompt submit
- [x] `.claude/settings.json` — hooks registered for PostToolUse and UserPromptSubmit
- [x] `.claude/skills/test-flow/SKILL.md` — custom `/test-flow` slash command
- [x] 1-2 plugins installed from the official marketplace
- [x] Filesystem MCP server configured
- [x] All committed and pushed

**Quick demo test**: Edit a Python file and watch the auto-format hook fire. Type `/test-flow` to see the skill in autocomplete. Run `/plugin` to see installed plugins.

### Step 1–2.5: Build the Backend (runs in parallel with extension)

This step and the next (extension build) run **in parallel** — that's the Sub Agents / Parallel Claude demo. In practice, you can either:

- Open **two Claude Code terminals** side by side (Parallel Claude) — one building the backend, one building the extension
- Or ask a single Claude Code session to use **sub agents** to do both at once

We'll cover the backend here. The extension step follows separately.

#### 2a. Create the FastAPI app entry point (10 min)

Ask Claude Code:

> "Create `backend/src/app/main.py` with a FastAPI app that has:
> - A health check endpoint: `GET /health` returning `{"status": "ok"}`
> - A CORS middleware allowing all origins (for the Chrome extension to call it)
> - Load environment variables from `.env` using python-dotenv
>
> Also create `backend/src/__init__.py` and `backend/src/app/__init__.py` so the package is importable."

The resulting `backend/src/app/main.py` should look roughly like:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="AI Commerce Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}
```

**Verify it works** — ask Claude Code:

> "Start the backend server and hit the health endpoint to verify it works."

It should run `cd backend && uv run uvicorn src.app.main:app --reload` and then `curl http://localhost:8000/health` returning `{"status":"ok"}`. Stop the server after verifying.

#### 2b. Create the Pydantic models (5 min)

Ask Claude Code:

> "Create `backend/src/app/models.py` with Pydantic models for the API:
>
> - `IntentRequest`: has a `prompt` field (string)
> - `Filter`: has `type` (string) and `value` (string)
> - `IntentResponse`: has `search_url` (string), `filters` (list of Filter), and `raw_query` (string, the cleaned search term)"

These are simple data classes — no business logic.

#### 2c. Build the Claude API integration (20 min)

This is the core of the backend. A single function that takes the user's prompt and returns a structured intent with search URL and filter plan.

Ask Claude Code:

> "Create `backend/src/app/services.py` with a function `extract_intent(prompt: str) -> IntentResponse` that:
>
> 1. Calls the Anthropic Claude API using the `anthropic` Python SDK
> 2. Uses a system prompt that instructs Claude to:
>    - Extract the shopping intent from the user's natural language prompt
>    - Return a JSON object with: `raw_query` (cleaned search terms for Amazon), `search_url` (Amazon India search URL), and `filters` (list of filters to apply)
>    - Each filter should have `type` (one of: price, brand, delivery, rating, color, size, discount) and `value` (the filter value to look for on the page)
> 3. Parses the Claude response as JSON and returns it as an `IntentResponse`
> 4. Uses the API key from the `ANTHROPIC_API_KEY` environment variable
>
> Use `claude-sonnet-4-5-20250929` as the model for cost efficiency.
> Use structured output or a clear JSON-only system prompt to ensure reliable parsing.
>
> Example — for prompt 'white nike tshirt under 500 fast delivery', the response should be:
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

**Key prompt engineering tip**: The system prompt to Claude is the most important part. It should:
- Specify Amazon India (amazon.in) as the target platform
- Explain the available filter types and how Amazon displays them
- Insist on JSON-only output with no extra text
- Handle edge cases (no filters needed, ambiguous prompts)

Ask Claude Code to iterate on the system prompt if the outputs aren't clean.

#### 2d. Wire the endpoint (5 min)

Ask Claude Code:

> "Add a `POST /api/intent` endpoint to `backend/src/app/main.py` that:
> - Accepts an `IntentRequest` body
> - Calls `extract_intent(request.prompt)` from services.py
> - Returns the `IntentResponse`
> - Has basic error handling — if the Claude API call fails, return a 500 with an error message"

#### 2e. Test manually with curl (5 min)

Ask Claude Code:

> "Start the backend server and test the `/api/intent` endpoint with these sample prompts using curl:
> 1. 'buy white nike tshirt under 500 fast delivery'
> 2. 'samsung phone under 15000 with good camera'
> 3. 'running shoes size 10 under 2000'
>
> Show me the full response for each."

Review the responses. If the filters don't look right, ask Claude Code to tweak the system prompt in `services.py`. This is the prompt engineering iteration loop — expect 2-3 rounds.

#### 2f. Write tests (10 min)

Ask Claude Code:

> "Write tests in `backend/tests/` for the backend:
>
> 1. `test_health.py` — test that `GET /health` returns 200 with `{"status": "ok"}`
> 2. `test_intent.py` — test that `POST /api/intent` with a valid prompt returns 200 with a response containing `search_url` and `filters` fields. Use httpx AsyncClient with the FastAPI app. Mock the Anthropic API call so tests don't need a real API key.
>
> Use pytest and pytest-asyncio."

**Verify tests pass**:

> "Run `cd backend && uv run pytest -v` and show me the results."

#### 2g. Commit (2 min)

Ask Claude Code:

> "Commit the backend code with message 'Add intent extraction API with Claude integration and tests'. Push to origin."

Or use the built-in `/commit` skill to demonstrate that feature.

#### Checkpoint (backend done)

At this point your backend should have:

- [x] `backend/src/app/main.py` — FastAPI app with `/health` and `/api/intent` endpoints
- [x] `backend/src/app/models.py` — Pydantic models (IntentRequest, Filter, IntentResponse)
- [x] `backend/src/app/services.py` — Claude API integration with prompt engineering
- [x] `backend/tests/test_health.py` — health endpoint test
- [x] `backend/tests/test_intent.py` — intent endpoint test with mocked Claude API
- [x] All tests passing
- [x] Committed and pushed

**Quick verification**: `curl -X POST http://localhost:8000/api/intent -H "Content-Type: application/json" -d '{"prompt":"blue adidas shoes under 3000"}'` returns a valid JSON response with `search_url` and `filters`.

### Step 1–2.5: Build the Chrome Extension (runs in parallel with backend)

This runs **in parallel** with the backend step above. If using Parallel Claude, open a second Claude Code terminal in the same project directory and work on this there. If using Sub Agents, Claude Code handles the parallelism for you.

The extension has 4 files to build: manifest, side panel (UI), service worker (coordinator), and content script (DOM operations). No backend calls yet — that's the wiring step (2.5–4).

#### 3a. Create the Chrome Extension manifest (5 min)

Ask Claude Code:

> "Create `extension/src/manifest.json` for a Chrome Extension Manifest V3 with:
> - Name: 'AI Commerce Agent'
> - Description: 'AI-powered shopping assistant for Amazon India'
> - Manifest version: 3
> - Permissions: `activeTab`, `scripting`, `sidePanel`, `storage`
> - Host permissions: `https://www.amazon.in/*`
> - Side panel: `default_path` pointing to `sidepanel.html`
> - Background service worker: `background.js`
> - Content scripts: `content.js` matching `https://www.amazon.in/*`
> - Action: default title 'Open AI Commerce Agent', default popup empty (we use side panel instead)
> - Icons: skip for now"

The manifest should look roughly like:

```json
{
  "manifest_version": 3,
  "name": "AI Commerce Agent",
  "version": "1.0.0",
  "description": "AI-powered shopping assistant for Amazon India",
  "permissions": ["activeTab", "scripting", "sidePanel", "storage"],
  "host_permissions": ["https://www.amazon.in/*"],
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://www.amazon.in/*"],
      "js": ["content.js"]
    }
  ],
  "action": {
    "default_title": "Open AI Commerce Agent"
  }
}
```

#### 3b. Build the Side Panel UI (20 min)

This is the chat interface the user interacts with. It has an HTML file and a TypeScript file.

**HTML:**

Ask Claude Code:

> "Create `extension/src/sidepanel.html` — a simple chat-style UI with:
> - A header bar with the title 'AI Commerce Agent'
> - A scrollable messages area in the middle (this will show status updates and results)
> - A fixed input area at the bottom with a text input and a Send button
> - Clean, minimal CSS — dark header, light body, chat bubbles for messages
> - A script tag loading `sidepanel.js`
>
> Keep it simple — no frameworks, just plain HTML and inline CSS in a `<style>` tag."

**TypeScript:**

Ask Claude Code:

> "Create `extension/src/sidepanel.ts` that:
> 1. Grabs references to the messages container, input field, and send button
> 2. On send (button click or Enter key):
>    - Gets the prompt text from the input
>    - Displays it as a user message bubble in the messages area
>    - Sends it to the background service worker via `chrome.runtime.sendMessage({ type: 'SEARCH_REQUEST', prompt: text })`
>    - Clears the input
> 3. Listens for messages from the background service worker via `chrome.runtime.onMessage`:
>    - `{ type: 'STATUS', message: string }` → display as a system status message (e.g., 'Understanding your request...')
>    - `{ type: 'RESULT', data: { filters_applied, filters_failed, search_url } }` → display as a results summary
>    - `{ type: 'ERROR', message: string }` → display as an error message
> 4. Auto-scrolls to the bottom when new messages appear
> 5. Shows a welcome message on load: 'Hi! Tell me what you want to buy and I'll find it on Amazon India.'"

#### 3c. Build the Background Service Worker (15 min)

The service worker coordinates between the side panel and the content script. For now, it just relays messages — the actual backend call wiring comes in step 2.5–4.

Ask Claude Code:

> "Create `extension/src/background.ts` that:
> 1. Listens for the extension icon click and opens the side panel using `chrome.sidePanel.open()`
> 2. Listens for messages from the side panel via `chrome.runtime.onMessage`:
>    - When it receives `{ type: 'SEARCH_REQUEST', prompt: string }`:
>      a. Sends `{ type: 'STATUS', message: 'Understanding your request...' }` back to the side panel
>      b. Calls the backend API at `http://localhost:8000/api/intent` with the prompt (use fetch)
>      c. Sends `{ type: 'STATUS', message: 'Searching Amazon India...' }` back
>      d. Opens the `search_url` from the response in the active tab using `chrome.tabs.update()`
>      e. Waits 2 seconds for the page to load
>      f. Sends the filters to the content script on that tab via `chrome.tabs.sendMessage(tabId, { type: 'APPLY_FILTERS', filters: [...] })`
>      g. Listens for the content script's response and relays it back to the side panel as a `RESULT` or `ERROR`
> 3. Has error handling — if the backend is unreachable or returns an error, send an `ERROR` message to the side panel
>
> For sending messages back to the side panel, use `chrome.runtime.sendMessage()` since the side panel listens via `chrome.runtime.onMessage`."

#### 3d. Build the Content Script (20 min)

This is the script that runs on Amazon India pages and interacts with the DOM. It parses filters and clicks them.

Ask Claude Code:

> "Create `extension/src/content.ts` that:
> 1. Listens for messages from the background service worker via `chrome.runtime.onMessage`
> 2. When it receives `{ type: 'APPLY_FILTERS', filters: [{ type, value }] }`:
>    a. Finds the filter sidebar on Amazon (the `#s-refinements` element)
>    b. For each filter in the list:
>       - Searches through all filter section headings and links in the sidebar
>       - Looks for text content that matches the filter value (case-insensitive, partial match)
>       - For example, filter `{ type: 'brand', value: 'Nike' }` should find a link/checkbox whose text contains 'Nike'
>       - For price filters like 'Under ₹500', look for text matching the price range
>       - For delivery filters like 'Prime', look for Prime-eligible checkbox
>       - Click the matching element
>       - Wait 1-2 seconds for the page to update (use a simple setTimeout)
>    c. Tracks which filters were successfully applied and which couldn't be found
>    d. Sends a response back: `{ type: 'FILTERS_DONE', applied: [...], failed: [...] }`
> 3. If the sidebar is not found (not a search results page), send back an error
>
> Keep the DOM querying simple — use `querySelectorAll` on `#s-refinements` to find spans and links.
> Amazon filter sidebar structure: `#s-refinements` contains multiple `div` sections, each with a heading span and a list of `a` or `span` elements with filter text.
> Don't overthink it — a simple text match is fine for a prototype."

#### 3e. Configure Vite to build the extension (10 min)

Vite needs to be configured to output separate files (not a single bundle) since Chrome extensions need individual JS files.

Ask Claude Code:

> "Create `extension/vite.config.ts` that:
> - Has multiple entry points: `src/sidepanel.ts`, `src/background.ts`, `src/content.ts`
> - Outputs to `extension/dist/`
> - Copies `src/manifest.json` and `src/sidepanel.html` to `dist/` as static files
> - Does NOT create a single bundle — each entry point should be a separate output file
> - Output filenames should be `sidepanel.js`, `background.js`, `content.js` (no hashes)
>
> Also add a `build` script to `extension/package.json`: `\"build\": \"vite build\"`"

**Verify the build works**:

> "Run `cd extension && npm run build` and show me the contents of `extension/dist/`."

You should see: `manifest.json`, `sidepanel.html`, `sidepanel.js`, `background.js`, `content.js`.

#### 3f. Load and test the extension in Chrome (5 min)

This is a manual step — you do this yourself:

1. Open Chrome → go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **"Load unpacked"**
4. Select the `extension/dist/` folder
5. The extension icon should appear in the toolbar
6. Click it → the Side Panel should open on the right
7. Verify you see the welcome message and the chat input

If something doesn't load, check the Chrome extension errors page at `chrome://extensions/` (click "Errors" on your extension card).

**Note**: The extension won't fully work yet — clicking Send will try to call the backend and fail if it's not running. That's fine — full wiring is the next step (2.5–4).

#### 3g. Commit (2 min)

Ask Claude Code:

> "Commit the extension code with message 'Add Chrome extension with side panel UI, service worker, and content script'. Push to origin."

Or use `/commit`.

#### Checkpoint (extension scaffold done)

At this point your extension should have:

- [x] `extension/src/manifest.json` — MV3 manifest with sidePanel, activeTab, scripting permissions
- [x] `extension/src/sidepanel.html` — chat-style HTML UI
- [x] `extension/src/sidepanel.ts` — side panel logic (send prompts, display status/results)
- [x] `extension/src/background.ts` — service worker (coordinates side panel ↔ backend ↔ content script)
- [x] `extension/src/content.ts` — content script (finds and clicks Amazon filters)
- [x] `extension/vite.config.ts` — multi-entry Vite build config
- [x] `extension/dist/` — built extension loadable in Chrome
- [x] Extension loads in Chrome, side panel opens with welcome message
- [x] Committed and pushed

**Quick verification**: Open Chrome, load the unpacked extension from `extension/dist/`, click the icon, see the side panel with the chat input.

### Step 2.5–4: Wire End-to-End and Debug

At this point you have a working backend and a working extension shell — but they haven't been tested together. This step is about connecting them, testing the full flow on live Amazon India pages, and fixing the inevitable issues.

#### 4a. Start both services (2 min)

You need two things running simultaneously:

1. **Backend** — in one terminal:
   ```bash
   cd backend && uv run uvicorn src.app.main:app --reload
   ```

2. **Extension** — already loaded in Chrome from step 3f. If you made changes, rebuild first:
   ```bash
   cd extension && npm run build
   ```
   Then go to `chrome://extensions/` and click the reload button on your extension.

#### 4b. First end-to-end test (10 min)

This is the moment of truth. Do it manually:

1. Open Chrome with the extension loaded
2. Navigate to `https://www.amazon.in` (or any page)
3. Click the extension icon → Side Panel opens
4. Type: **"white nike tshirt under 500"**
5. Click Send

**What should happen:**
- Side panel shows "Understanding your request..."
- Side panel shows "Searching Amazon India..."
- The active tab navigates to Amazon search results
- Side panel shows "Applying filters..."
- Filters get clicked on the Amazon page
- Side panel shows results summary

**What will probably go wrong (and how to fix each):**

| Issue | Symptom | Fix |
|-------|---------|-----|
| Backend not reachable | Side panel shows error after "Understanding your request..." | Check backend is running on port 8000, check CORS middleware is set up |
| Search URL doesn't open | Side panel stays on "Searching Amazon India..." | Check `chrome.tabs.update()` in background.ts — may need to query active tab ID first |
| Content script not injected | Filters never apply, no response from content script | Check manifest.json `content_scripts.matches` includes the Amazon URL pattern. Check `chrome://extensions/` for errors |
| Content script can't find filters | "0 filters applied" | Amazon's filter sidebar may have different selectors — inspect the actual page and update content.ts |
| Filters found but click doesn't work | Filter element found but page doesn't update | Some Amazon filters are `<a>` tags (need `.click()`), others are `<span>` inside checkboxes. May need to click the parent element |
| Page reloads after each filter click | Filters partially applied, then page reloads and loses state | Amazon reloads after each filter. Need to wait for reload + re-find remaining filters. Apply one filter at a time with longer waits |
| CORS error | Network error in service worker | Verify CORS middleware in FastAPI allows all origins |

#### 4c. Fix the content script DOM selectors (20 min)

This will be the most time-consuming debugging. Amazon's DOM structure is specific and may differ from what Claude Code guessed.

Ask Claude Code:

> "I'm going to paste the HTML structure of Amazon India's filter sidebar. Please update `extension/src/content.ts` to use the correct selectors."

**How to get Amazon's filter sidebar HTML:**

1. Go to `https://www.amazon.in/s?k=tshirt` in Chrome
2. Right-click on the filter sidebar → Inspect
3. Find the `#s-refinements` element
4. Right-click → Copy → Copy outerHTML
5. Paste it to Claude Code

Claude Code will then update the content script with the correct CSS selectors for:
- Brand filter links
- Price range links
- Delivery/Prime filter
- Rating filter
- Other filter types

**Key Amazon DOM patterns to look for:**
- Filter sections are usually `div` elements with a heading (`span.a-size-base.a-color-base.a-text-bold`)
- Filter options are `a` tags inside `li` elements within each section
- Some filters are checkboxes (brand, delivery), others are links (price ranges)
- The "Prime" filter often has a specific class or `data-*` attribute

After updating, rebuild and reload:

> "Rebuild the extension (`cd extension && npm run build`)"

Then in Chrome: `chrome://extensions/` → reload the extension → test again.

#### 4d. Handle Amazon page reloads (15 min)

Amazon reloads the page when you click a filter. This means after the first filter click, the content script needs to survive the reload and apply remaining filters.

Ask Claude Code:

> "Update the content script and background service worker to handle Amazon's page reload behavior:
>
> **Option A (simpler):** Apply filters one at a time. After clicking a filter, the content script reports back. The background service worker then waits for the page to reload (use `chrome.tabs.onUpdated` to detect when the tab finishes loading), re-sends the remaining filters to the content script, and repeats until all filters are applied or attempted.
>
> **Option B (simplest):** Only apply the most impactful filter (usually price or brand) and report the others as 'suggested but not applied' in the side panel. This avoids the reload chain entirely.
>
> Go with Option A if it's clean, fall back to Option B if we're running low on time."

Rebuild and test again after this change.

#### 4e. Polish the side panel messages (10 min)

After the flow works, improve the status messages so the demo looks polished.

Ask Claude Code:

> "Update the side panel status messages to be more descriptive and user-friendly:
> - 'Understanding your request...' → keep as is
> - 'Searching Amazon India...' → keep as is
> - After filters are applied, show a summary like:
>   '✅ Applied 3 filters: Brand: Nike, Price: Under ₹500, Delivery: Prime'
>   '⚠️ Could not find: Color: White'
> - If no filters were applied: 'Showing search results for "white nike tshirt". No matching filters found on this page.'
> - Show the search URL as a clickable link in the results"

Rebuild and reload the extension.

#### 4f. Test with multiple prompts (10 min)

Test with a variety of prompts to ensure robustness:

1. **"white nike tshirt under 500 fast delivery"** — the standard test case
2. **"samsung phone under 15000"** — different category
3. **"running shoes size 10"** — size filter (may not work — that's OK for the demo)
4. **"laptop bag under 1000"** — simple query with price filter
5. **"protein powder under 2000 with good ratings"** — rating filter

Note which prompts work well — pick the best 2-3 for your demo.

#### 4g. Commit (2 min)

Ask Claude Code:

> "Commit all the wiring and debugging fixes. Push to origin."

Or use `/commit`.

#### Checkpoint (end-to-end working)

At this point you should have:

- [x] Backend running and responding to `/api/intent`
- [x] Extension loaded in Chrome, side panel opens
- [x] Full flow works: type prompt → Amazon opens → filters applied → results shown in side panel
- [x] At least 2-3 sample prompts that produce a clean demo
- [x] Committed and pushed

**This is the most critical checkpoint** — if the end-to-end flow works, you have a demo-able prototype. Everything after this is polish.

### Step 4–5: Test on Amazon India with Real Prompts + Fix Edge Cases

Now that end-to-end works, this step is about hardening the prototype with the `/test-flow` custom skill and fixing the edge cases that will embarrass you during the live demo.

#### 5a. Use the /test-flow custom skill (5 min)

This demonstrates the **Skills** feature. Make sure your backend is running, then in Claude Code:

> `/test-flow`

The skill should hit `http://localhost:8000/api/intent` with the sample prompt and show you the response. If it fails, fix the skill definition or the backend endpoint.

This is a great moment for your hackathon narrative: *"I created a custom slash command that runs my end-to-end test with one keystroke."*

#### 5b. Systematic testing on live Amazon pages (20 min)

Go through these test scenarios in Chrome with the extension. For each one, note what works and what breaks.

**Category: Clothing**

| Prompt | Expected filters | Notes |
|--------|-----------------|-------|
| "white nike tshirt under 500 fast delivery" | Brand: Nike, Price: Under ₹500, Delivery: Prime | Your main demo prompt |
| "men's blue jeans size 32 under 1500" | Gender: Men, Color: Blue, Size: 32, Price | Size filters are tricky on Amazon |
| "women's kurti under 800" | Gender: Women, Price | Different category layout |

**Category: Electronics**

| Prompt | Expected filters | Notes |
|--------|-----------------|-------|
| "samsung phone under 15000" | Brand: Samsung, Price | Electronics has different filter layout |
| "wireless earbuds under 2000 with good ratings" | Price, Rating: 4★ & up | Rating filter uses star icons |

**Category: Groceries / Daily needs**

| Prompt | Expected filters | Notes |
|--------|-----------------|-------|
| "protein powder under 2000" | Price | Simpler filter set |
| "laptop bag under 1000" | Price | Usually works well |

For each failure, tell Claude Code what went wrong:

> "When I search for 'samsung phone under 15000', the price filter isn't being clicked. The Amazon page shows price ranges as 'Under ₹10,000', '₹10,000 - ₹15,000', etc. Update the content script to handle price range matching more intelligently — if the user says 'under 15000', it should click '₹10,000 - ₹15,000' or 'Under ₹15,000' if available."

Rebuild and reload after each fix.

#### 5c. Fix the top 3 issues (25 min)

Based on testing, the most common issues will likely be:

**Issue 1: Price filter matching**

Amazon shows price as ranges like "Under ₹500", "₹500 - ₹1,000", etc. The content script needs to parse these and match intelligently.

Ask Claude Code:

> "Update the content script's price filter matching. When the backend says `{ type: 'price', value: 'Under ₹500' }`, the content script should:
> - Look for an exact text match first ('Under ₹500')
> - If not found, look for a range that contains the target price (e.g., '₹200 - ₹500')
> - Handle both '₹' and 'Rs.' formats
> - Handle comma-separated numbers ('₹1,000' vs '₹1000')"

**Issue 2: Brand filter not found**

Amazon sometimes shows brands in a collapsed section that needs expanding, or the brand name is slightly different (e.g., "NIKE" vs "Nike").

Ask Claude Code:

> "Update the content script's brand filter matching to:
> - Do case-insensitive comparison
> - Click 'See more' links in filter sections if the brand isn't visible in the initial list
> - Handle partial matches (e.g., 'Nike' should match 'NIKE' or 'Nike Men's')"

**Issue 3: Content script timing**

The content script may run before the filter sidebar is fully loaded, especially on slow connections.

Ask Claude Code:

> "Update the content script to wait for the filter sidebar to appear before trying to parse it. Use a MutationObserver or a polling approach — check every 500ms for up to 10 seconds for `#s-refinements` to exist in the DOM. Only start parsing filters once it's found."

Rebuild and test after each fix.

#### 5d. Pick your demo prompts (5 min)

Based on all testing, pick **3 prompts** that consistently work well:

1. A **clothing** prompt (usually most reliable)
2. An **electronics** prompt
3. A **simple/general** prompt

Write these down — you'll use them in step 7–8 (demo prep).

#### 5e. Commit (2 min)

> `/commit`

Use the built-in commit skill to demonstrate it.

#### Checkpoint (hardened prototype)

- [x] `/test-flow` skill works and demonstrates the Skills feature
- [x] Tested across 3+ product categories on live Amazon India
- [x] Price filter matching handles ranges and currency formats
- [x] Brand filter matching is case-insensitive with "See more" expansion
- [x] Content script waits for DOM to load before parsing
- [x] 3 reliable demo prompts identified
- [x] Committed and pushed

### Step 5–5.5: GitHub Actions CI Pipeline

This demonstrates the **GitHub Actions** feature and takes about 30 minutes.

#### 6a. Create the CI workflow (10 min)

Ask Claude Code:

> "Create `.github/workflows/ci.yml` — a GitHub Actions CI pipeline that:
>
> 1. Triggers on push to `main` and on pull requests
> 2. Uses Ubuntu latest
> 3. Has two jobs that run in parallel:
>
> **Job: backend**
> - Checkout code
> - Install uv (`astral-sh/setup-uv` action)
> - Set up Python 3.12
> - Install dependencies: `cd backend && uv sync`
> - Lint: `cd backend && uv run ruff check .`
> - Test: `cd backend && uv run pytest -v`
>
> **Job: extension**
> - Checkout code
> - Set up Node.js 20
> - Install dependencies: `cd extension && npm ci`
> - Lint: `cd extension && npx eslint src/ --no-error-on-unmatched-pattern`
> - Build: `cd extension && npm run build`
> - Test: `cd extension && npx vitest run` (if tests exist)
>
> Use caching for both uv and npm to speed up runs."

#### 6b. Fix any lint/test issues (10 min)

The CI pipeline may reveal lint or test issues that pass locally but fail in CI. Common issues:

- Missing `__init__.py` files
- Ruff rules that weren't enforced locally
- ESLint config not set up (need a basic `.eslintrc` or `eslint.config.js` in extension/)
- Import errors in tests

Ask Claude Code to fix whatever fails.

#### 6c. Push and verify green build (10 min)

> `/commit`

Then push and check the GitHub Actions tab:

> "Push to origin and give me the URL to check the GitHub Actions workflow."

Go to `https://github.com/piyushtechproduct/anthropic-hackathon/actions` and watch the build.

If it fails, ask Claude Code to read the error and fix it. Iterate until you get a green check.

#### Checkpoint (CI done)

- [x] `.github/workflows/ci.yml` — CI pipeline with backend + extension jobs
- [x] Both jobs passing (green check on GitHub)
- [x] Linting and tests run automatically on every push

**Demo point**: Show the green check on GitHub and the parallel job execution.

### Step 5.5–6: Wrap Backend as Custom MCP Server

This demonstrates the **MCP Servers** feature. You'll wrap your FastAPI intent API as an MCP server that Claude Code can call directly as a tool.

#### 7a. Create the MCP server script (15 min)

Ask Claude Code:

> "Create `backend/mcp_server.py` — an MCP server (using the `mcp` Python package) that exposes the intent extraction as a tool. Specifically:
>
> 1. Install the `mcp` package: `cd backend && uv add mcp`
> 2. Create an MCP server with one tool called `extract_shopping_intent`:
>    - Input: `prompt` (string) — the user's shopping request
>    - Action: calls the same `extract_intent()` function from `services.py`
>    - Output: returns the JSON response (search_url, filters) as text
> 3. The server should use stdio transport (reads from stdin, writes to stdout)
> 4. Load environment variables from `.env` so the Anthropic API key is available
>
> Use the `mcp` Python SDK. The basic structure is:
> ```python
> from mcp.server import Server
> import mcp.server.stdio
> ```"

#### 7b. Register the MCP server with Claude Code (5 min)

Ask Claude Code:

> "Add the commerce agent MCP server to this project. Run:
> ```
> claude mcp add --transport stdio commerce-agent -- uv run --directory /Users/saurabh.karmakar/pythonProjects/aicommerceanalysis/backend python mcp_server.py
> ```"

Or add it directly to `.mcp.json`:

```json
{
  "mcpServers": {
    "commerce-agent": {
      "type": "stdio",
      "command": "uv",
      "args": ["run", "--directory", "/Users/saurabh.karmakar/pythonProjects/aicommerceanalysis/backend", "python", "mcp_server.py"],
      "env": {
        "PYTHONUNBUFFERED": "1"
      }
    }
  }
}
```

#### 7c. Test the MCP server from Claude Code (5 min)

Restart Claude Code (so it picks up the new MCP server), then ask:

> "Use the extract_shopping_intent tool to find me a white nike tshirt under 500 with fast delivery."

Claude Code should invoke your custom MCP tool and show the structured response — search URL and filter plan — directly in the conversation.

**This is a powerful demo moment**: You're showing that your commerce agent API is now a first-class tool that Claude Code can call, just like file reading or web search.

#### 7d. Commit (2 min)

> `/commit`

#### Checkpoint (MCP done)

- [x] `backend/mcp_server.py` — custom MCP server wrapping the intent API
- [x] `.mcp.json` — MCP server registered (filesystem + commerce-agent)
- [x] Claude Code can call `extract_shopping_intent` as a tool
- [x] Committed and pushed

**Demo point**: Ask Claude Code a shopping question and watch it use your custom tool.

### Step 6–7: End-to-End Polish + Error Handling

This step is about making the prototype feel solid for the demo. Focus on what the audience will see.

#### 8a. Polish the side panel UI (20 min)

Ask Claude Code:

> "Improve the side panel UI styling:
> - Add a subtle loading spinner/animation when waiting for a response
> - Style user messages as right-aligned blue bubbles
> - Style system messages as left-aligned gray bubbles
> - Style error messages with a red tint
> - Style the results summary with a green success indicator
> - Make the input area have a subtle border and rounded corners
> - Add a small 'Powered by Claude' text in the footer
> - Make sure the UI looks good at different side panel widths (it can be resized)"

Rebuild and check in Chrome.

#### 8b. Add error handling for common failures (15 min)

Ask Claude Code:

> "Add user-friendly error handling throughout the extension:
>
> 1. **Backend unreachable**: If the fetch to localhost:8000 fails, show 'Backend server is not running. Please start it with: cd backend && uv run uvicorn src.app.main:app --reload'
> 2. **Not on Amazon**: If the user sends a prompt but the active tab is not on amazon.in, show 'Please navigate to Amazon India (amazon.in) first, or I can open it for you.'
> 3. **No filters found on page**: If the content script can't find the filter sidebar, show 'This doesn't look like a search results page. Try searching for something on Amazon first.'
> 4. **Claude API error**: If the backend returns a 500, show 'Something went wrong understanding your request. Please try rephrasing.'
> 5. **Timeout**: If no response after 15 seconds, show 'This is taking too long. The backend might be overloaded.'"

Rebuild and test each error scenario.

#### 8c. Add the Sandboxing demo moment (5 min)

This demonstrates the **Sandboxing** feature. During the hackathon demo, you can show this:

Ask Claude Code to do something that triggers a permission prompt:

> "Delete all files in the backend/tests directory"

Claude Code will ask for permission (sandboxing). **Deny it** and explain to the audience: *"Claude Code sandboxes all destructive operations and requires explicit permission. This prevents accidental file deletion, unsafe commands, and other risky operations."*

No code changes needed — this is purely a demo moment. Just practice it.

#### 8d. Commit (2 min)

> `/commit`

#### Checkpoint (polished prototype)

- [x] Side panel has clean, professional styling with loading states
- [x] User-friendly error messages for all common failure modes
- [x] Sandboxing demo moment practiced
- [x] Committed and pushed

### Step 7–8: Prepare Demo and Rehearse

The final hour. No new code — just preparation.

#### 9a. Prepare the demo environment (10 min)

1. **Close unnecessary Chrome tabs** — keep only one tab open
2. **Start the backend** in a terminal: `cd backend && uv run uvicorn src.app.main:app --reload`
3. **Rebuild the extension**: `cd extension && npm run build`
4. **Reload the extension** in `chrome://extensions/`
5. **Open Claude Code** in a terminal side by side with Chrome
6. **Clear the Claude Code conversation** with `/clear` for a fresh start
7. **Pre-open** the GitHub Actions page to show green builds: `https://github.com/piyushtechproduct/anthropic-hackathon/actions`

#### 9b. Prepare the demo script (15 min)

Practice this exact sequence:

**Part 1: The Product (2 min)**

1. Show Chrome with the extension loaded
2. Click the extension icon → Side Panel opens
3. Type: **"I want a white Nike t-shirt under 500 rupees with fast delivery"**
4. Watch the full flow: intent → search → filters → results
5. Type a second prompt: **"samsung phone under 15000"** — show it works across categories

**Part 2: Claude Code Features (3-4 min)**

Walk through each feature quickly:

| Feature | What to show | Time |
|---------|-------------|------|
| **MCP Servers** | Ask Claude Code: "Use the extract_shopping_intent tool for running shoes under 2000" → watch it call your custom MCP tool | 30s |
| **GitHub Actions** | Show the green build on GitHub Actions page, point out parallel jobs | 20s |
| **Sub Agents** | Show your Claude Code conversation history where backend and extension were built in parallel | 20s |
| **Hooks** | Edit a Python file → show "Auto-formatting..." status. Submit a prompt → show "Running lint checks..." | 20s |
| **Plugins** | Run `/plugin` → show installed plugins from the marketplace | 15s |
| **Skills** | Run `/test-flow` → show the custom skill executing the end-to-end test | 20s |
| **Sandboxing** | Ask Claude Code to delete a file → show the permission prompt → deny it | 20s |
| **Parallel Claude** | Mention that you used two Claude Code instances to build backend and extension simultaneously | 15s |

**Part 3: Architecture (1 min)**

Briefly explain the architecture:
- "Side panel sends prompt to FastAPI backend"
- "Backend calls Claude API to understand intent and generate filter plan"
- "Extension opens Amazon, content script finds and clicks the right filters"
- "All deterministic — LLM decides what, code decides how"

#### 9c. Rehearse twice (20 min)

Run through the full demo twice:

1. **First rehearsal**: Go through the full script, note any rough spots or timing issues
2. **Fix anything that broke** — rebuild if needed
3. **Second rehearsal**: Timed run, aim for under 7 minutes total

**Common demo pitfalls to avoid:**
- Backend not running (always start it first)
- Extension not rebuilt after last code change (always rebuild before demo)
- Amazon showing CAPTCHA (use a fresh Chrome profile or clear cookies)
- Slow internet making Amazon load slowly (have a backup: pre-record a screen capture)

#### 9d. Prepare a backup (10 min)

If something goes wrong during the live demo:

1. **Record a screen capture** of the full working flow (use QuickTime on macOS: File → New Screen Recording)
2. Save it as `demo-backup.mov` (don't commit it — it'll be too large)
3. If the live demo breaks, switch to: *"Let me show you the recording of this working end-to-end, and then I'll walk you through the code."*

#### Final Checkpoint (ready to demo)

- [x] Backend running, extension loaded, Claude Code open
- [x] 3 demo prompts that work reliably
- [x] Demo script practiced and timed (under 7 min)
- [x] All 8 Claude Code features ready to demonstrate
- [x] Backup screen recording saved
- [x] GitHub Actions showing green builds
- [x] Know the architecture story by heart

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

### 5. Skills

Create custom Claude Code skills:

- **`/build`** — Builds the extension with Vite and starts the FastAPI server
- **`/test-flow`** — Runs an end-to-end test: sends a sample prompt to the backend, validates the structured response
- **`/deploy`** — Pushes to GitHub, triggers the CI workflow

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

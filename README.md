# AI Commerce Agent 🛒

An intelligent Chrome extension that helps users shop across Amazon India and Flipkart using natural language queries powered by Claude AI.

## Overview

This hackathon project demonstrates a hybrid client+cloud architecture where **LLMs decide "what"** (intent extraction) and **deterministic code decides "how"** (all DOM interactions and filter applications).

### Key Features

- 🔍 **Natural Language Search**: "white tshirt under 500 with fast delivery"
- 🏪 **Multi-Platform**: Searches Amazon and Flipkart in parallel
- 🎯 **Smart Filtering**: Automatically applies price, brand, delivery, color filters
- 🎨 **Visual Carousel**: Interleaved results with platform badges
- 🛡️ **Zero Trust LLM**: All outputs validated, no raw LLM to DOM
- ⚡ **Fast**: Parallel processing with hidden background tabs

## Architecture

```
User Prompt → Side Panel → FastAPI Backend → Claude API (Intent)
                ↓
        Background Script
        ├── Amazon Tab (hidden) → Amazon Adapter → Extract Products
        └── Flipkart Tab (hidden) → Flipkart Adapter → Extract Products
                ↓
        Interleave & Display in Carousel
```

### Tech Stack

**Backend:**
- FastAPI (Python 3.12)
- Anthropic Claude API (claude-sonnet-4-5-20250929)
- `uv` for dependency management
- Pydantic for validation

**Extension:**
- Chrome Manifest V3
- TypeScript + Vite
- Side Panel API
- Dynamic content script injection

**Development:**
- Claude Code hooks (auto-format, lint-check)
- MCP servers (custom commerce agent server)
- GitHub Actions CI (parallel backend + extension jobs)

## Quick Start

### Prerequisites

- Python 3.12+
- Node 20+
- Chrome browser
- Anthropic API key

### 1. Clone and Setup

```bash
git clone https://github.com/piyushtechproduct/anthropic-hackathon.git
cd anthropic-hackathon

# Create .env file
echo "ANTHROPIC_API_KEY=your-key-here" > .env
```

### 2. Start Backend

```bash
cd backend
uv sync
uv run uvicorn src.app.main:app --reload
```

Backend runs on `http://localhost:8000`

### 3. Build Extension

```bash
cd extension
npm install
npm run build
```

### 4. Load in Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select folder: `extension/dist`

### 5. Try It!

1. Click the extension icon
2. Side panel opens
3. Type: **"nike shoes under 2000"**
4. Watch products appear!

## Demo Prompts

| Prompt | What It Tests |
|--------|---------------|
| "white tshirt under 500 with fast delivery" | Price, color, delivery filters |
| "nike shoes under 2000" | Brand + price filter |
| "samsung phone under 15000" | Electronics category |

## Project Structure

```
anthropic-hackathon/
├── backend/
│   ├── src/
│   │   └── app/
│   │       ├── main.py          # FastAPI app
│   │       ├── models.py        # Pydantic models
│   │       └── services.py      # Claude API integration
│   ├── mcp_server.py            # Custom MCP server
│   └── pyproject.toml           # Dependencies
├── extension/
│   ├── src/
│   │   ├── adapters/
│   │   │   ├── amazon.ts        # Amazon adapter (259 lines)
│   │   │   ├── flipkart.ts      # Flipkart adapter (270 lines)
│   │   │   └── types.ts         # Adapter interface
│   │   ├── background.ts        # Service worker orchestration
│   │   ├── content.ts           # Content script router
│   │   ├── sidepanel.ts         # UI logic
│   │   ├── sidepanel.html       # Side panel UI
│   │   ├── manifest.json        # Extension manifest
│   │   └── types.ts             # Shared types
│   └── dist/                    # Built files (load this in Chrome)
├── .github/
│   └── workflows/
│       └── ci.yml               # Parallel backend + extension CI
├── .claude/
│   ├── hooks/                   # Auto-format, lint-check
│   ├── skills/test-flow/        # Custom test skill
│   └── settings.json            # Claude Code config
├── docs/                        # Technical specs
└── DEMO.md                      # Demo guide

```

## Development

### Backend Tests

```bash
cd backend
uv run pytest -v
```

### Lint & Format

```bash
# Backend
cd backend
uv run ruff check .
uv run ruff format .

# Extension
cd extension
npx eslint src/
npx prettier --write src/
```

### Rebuild Extension

```bash
cd extension
npm run build
```

Then reload extension in `chrome://extensions/`

## Testing

### Manual API Test

```bash
curl -X POST http://localhost:8000/api/intent/multi \
  -H "Content-Type: application/json" \
  -d '{"prompt": "nike shoes under 2000"}'
```

Expected response:
```json
{
  "raw_query": "nike shoes",
  "platforms": [
    {
      "platform": "amazon",
      "search_url": "https://www.amazon.in/s?k=nike+shoes",
      "filters": [
        {"type": "brand", "value": "Nike"},
        {"type": "price", "value": "Under ₹2000"}
      ]
    },
    {
      "platform": "flipkart",
      "search_url": "https://www.flipkart.com/search?q=nike+shoes",
      "filters": [
        {"type": "brand", "value": "Nike"},
        {"type": "price", "value": "Under ₹2000"}
      ]
    }
  ]
}
```

## Debugging

### Extension Not Working?

1. **Check Service Worker Console:**
   - `chrome://extensions/` → Click "service worker" link
   - Look for logs: `[Background] Processing amazon...`

2. **Check Backend:**
   ```bash
   curl http://localhost:8000/health
   # Should return: {"status":"ok"}
   ```

3. **Rebuild Extension:**
   ```bash
   cd extension && npm run build
   ```
   Then reload in Chrome

## CI/CD

GitHub Actions runs on every push:
- **Backend Job**: Install uv → ruff check → pytest
- **Extension Job**: npm ci → build → verify artifacts

View builds: `https://github.com/piyushtechproduct/anthropic-hackathon/actions`

## MCP Server

Custom MCP server exposes intent extraction tools:

```bash
# Register with Claude Code
claude mcp add --transport stdio commerce-agent -- \
  uv run --directory /path/to/backend python mcp_server.py

# Test in Claude Code
> Use extract_multi_platform_shopping_intent for "nike shoes under 2000"
```

## Key Design Decisions

1. **Zero Trust for LLM Outputs**: JSON schema validation, no raw LLM to DOM
2. **No LLM-triggered Clicks**: All DOM interactions are rule-based
3. **Progressive Autonomy**: Search/filters (full) → Cart (assisted) → Payment (human-only)
4. **Adapter Pattern**: Easy to add new platforms without code rewrites
5. **Hidden Tabs**: Non-intrusive parallel scraping

## Known Limitations (Hackathon Scope)

- ✅ Amazon India working
- ⚠️ Flipkart partially working (DOM selectors need updates)
- ❌ No cart or checkout functionality
- ❌ No personalization or user history
- ❌ No database (all stateless)

## Built With Claude Code

This project showcases Claude Code features:

- ✅ **Hooks**: Auto-format on edit, lint-check on submit
- ✅ **MCP Servers**: Custom commerce agent server
- ✅ **Skills**: `/test-flow` for end-to-end testing
- ✅ **GitHub Actions**: Parallel CI/CD
- ✅ **Sub Agents**: Parallel backend + extension development

## Contributing

This is a hackathon project. For production use, add:
- Database (Redis, Neo4j, Vector DB)
- Authentication
- Rate limiting
- Error boundaries
- More robust platform adapters
- Cart and checkout workflows

## License

MIT License - see LICENSE file

## Acknowledgments

- Built for Anthropic Claude Code Hackathon
- Uses Claude API for intent extraction
- Amazon and Flipkart for e-commerce data

---

**Demo**: See [DEMO.md](./DEMO.md) for presentation guide

**Docs**: See [docs/](./docs/) for technical specifications

# AI Commerce Agent - Demo Guide

## Quick Start

### 1. Start Backend
```bash
cd backend
uv run uvicorn src.app.main:app --reload
```
Backend runs on `http://localhost:8000`

### 2. Load Extension
1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select folder: `extension/dist`

### 3. Test the Extension
1. Click the extension icon → Side panel opens
2. Try these demo prompts:

| Prompt | Expected Result |
|--------|----------------|
| **"white tshirt under 500"** | Products from Amazon (and Flipkart if working) |
| **"nike shoes under 2000"** | Nike shoes with price filter applied |
| **"samsung phone under 15000"** | Samsung phones from both platforms |

## Demo Flow (5 minutes)

### Part 1: The Product (2 min)
1. Show Chrome with extension loaded
2. Click extension icon → Side panel opens
3. Type: **"white tshirt under 500 with fast delivery"**
4. Explain:
   - Side panel sends prompt to FastAPI backend
   - Backend calls Claude API to extract intent
   - Extension opens hidden tabs for Amazon and Flipkart
   - Adapters apply filters and extract products
   - Products displayed in carousel with platform badges

### Part 2: Architecture (1 min)
- **Client-side**: Chrome Extension (MV3) with platform adapters
- **Backend**: FastAPI with Claude API integration
- **LLM Role**: Decides "what" (intent extraction only)
- **Deterministic Code**: Decides "how" (all DOM interactions)

### Part 3: Claude Code Features (2 min)
| Feature | How to Show |
|---------|-------------|
| **GitHub Actions** | Show green build at `https://github.com/{user}/anthropic-hackathon/actions` |
| **MCP Server** | `claude mcp list` shows "AI Commerce Agent" server |
| **Hooks** | Edit `.py` file → auto-formatting happens |
| **Skills** | `/test-flow` runs end-to-end tests |

## Troubleshooting

### "No products found"
- **Check backend**: `curl http://localhost:8000/health` should return `{"status":"ok"}`
- **Check Service Worker console**: `chrome://extensions/` → click "service worker" link
- Look for logs: `[Background] Processing amazon...` and `[Amazon] Extracted X products`

### Flipkart not working
- Flipkart's DOM changes frequently - focus demo on **Amazon only**
- Amazon is the primary requirement, Flipkart is a bonus

### Extension not loading
- Verify `extension/dist/` contains: `background.js`, `content.js`, `sidepanel.js`, `manifest.json`, `sidepanel.html`
- Rebuild: `cd extension && npm run build`

## Testing

### Backend Tests
```bash
cd backend
uv run pytest -v
```

### Manual API Test
```bash
curl -X POST http://localhost:8000/api/intent/multi \
  -H "Content-Type: application/json" \
  -d '{"prompt": "nike shoes under 2000"}'
```

## Demo Environment Checklist

- [ ] Backend running on port 8000
- [ ] Extension loaded in Chrome
- [ ] Service worker shows active (blue link)
- [ ] Chrome DevTools open to show logs
- [ ] GitHub Actions page open showing green builds
- [ ] Close unnecessary tabs
- [ ] Test prompt ready: "white tshirt under 500 with fast delivery"

## Key Differentiators

1. **Hybrid Architecture**: LLM for intent, deterministic code for execution
2. **Multi-platform**: Parallel search across Amazon and Flipkart
3. **Adapter Pattern**: Pluggable platform-specific extractors
4. **Guardrails**: JSON schema validation, no raw LLM output to DOM
5. **Built with Claude Code**: Hooks, MCP servers, skills, parallel sub-agents

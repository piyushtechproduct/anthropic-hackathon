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

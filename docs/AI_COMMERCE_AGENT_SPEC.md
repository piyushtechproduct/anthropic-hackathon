
```md
# AI Commerce Agent – Client-Side Buying Automation
Version: v1.0  
Status: Build-Ready  
Audience: Engineering (Frontend, Backend, AI), Cursor / Codegen Agents

---

## 1. Objective

Build an **AI-powered commerce agent** that runs on the **user’s device** (browser extension initially) and assists / automates the buying journey on third-party eCommerce platforms (Amazon, Flipkart, etc).

The agent must:
- Understand user intent from natural language
- Apply user personalization
- Open platform search result pages
- Parse DOM to discover filters
- Semantically map intent → filters
- Apply filters deterministically
- Prepare checkout (no autonomous payment)

---

## 2. Non-Goals (Explicit)

The system must NOT:
- Store platform credentials off-device
- Let LLMs directly click UI elements
- Send raw DOM or credentials to cloud
- Depend solely on vision-based automation

---

## 3. High-Level Architecture



┌────────────────────────────────────────┐
│ Client Device (Browser Extension)      │
│                                        │
│  ┌──────────────┐   ┌────────────────┐ │
│  │ DOM Parser   │──▶│ Filter Normal  │ │
│  └──────┬───────┘   └──────┬─────────┘ │
│         │                  │           │
│  ┌──────▼─────────┐  ┌─────▼────────┐  │
│  │ Local LLM      │  │ Action Exec  │  │
│  │ (Semantic only)│  │ (Clicks only)│  │
│  └──────┬─────────┘  └─────┬────────┘  │
│         │                  │           │
│  ┌──────▼──────────────────▼────────┐  │
│  │ Client Policy & Guardrails       │  │
│  └──────────────┬───────────────────┘  │
└─────────────────┼──────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────┐
│ Cloud (Stateless APIs)                 │
│                                        │
│  ┌──────── Intent Agent ─────────────┐ │
│  ├──────── Personalization Engine ───┤ │
│  ├──────── Platform Strategy ────────┤ │
│  └──────── Search Plan Builder ──────┘ │
└────────────────────────────────────────┘



---

## 4. Key Design Principles

### 4.1 Determinism over Intelligence
- LLMs decide **what**
- Code decides **how**

### 4.2 Progressive Autonomy
| Step     | Autonomy   |
|----------|------------|
| Search.  | Full       |
| Filters  | Full       |
| Cart     | Full       |
| Checkout | Assist     |
| Payment  | Human only |

### 4.3 Zero Trust for LLM Outputs
- All LLM outputs validated via JSON schema
- Whitelisted IDs only
- No execution without guardrails

---

## 5. Server-Side Responsibilities

### 5.1 Inputs
- `user_id`
- `user_prompt`

### 5.2 Personalization Sources

| Store    | Purpose                  |
|----------|--------------------------|
| Redis    | Hot preferences          |
| GraphDB  | Structured relationships |
| VectorDB | Behavioral similarity    |

### Example User Context
&#96;&#96;&#96;json
{
  "size": "XL",
  "preferred_brands": ["Nike", "Adidas"],
  "delivery_bias": "fast",
  "price_sensitivity": "medium"
}
&#96;&#96;&#96;

---

### 5.3 Intent Inference (LLM)

#### Input

&#96;&#96;&#96;json
{
  "prompt": "Buy white tshirt under 500",
  "personalization": { ... }
}
&#96;&#96;&#96;

#### Output (STRICT JSON)

&#96;&#96;&#96;json
{
  "category": "tshirt",
  "gender": "men",
  "constraints": {
    "price_max": 500,
    "rating_min": 4,
    "delivery": "fast"
  },
  "brands": ["Nike", "Adidas"],
  "platform": "amazon"
}
&#96;&#96;&#96;

---

### 5.4 Search Plan Builder

#### Output

&#96;&#96;&#96;json
{
  "platform": "amazon",
  "search_url": "https://www.amazon.in/s?k=nike+tshirt+men",
  "filters_needed": {
    "price_max": 500,
    "rating_min": 4,
    "delivery": "fast"
  }
}
&#96;&#96;&#96;

---

## 6. Client-Side Responsibilities

### 6.1 Open Search Page

* Use platform-generated search URL
* No direct DOM mutation before page load

---

### 6.2 DOM Parsing (Rule-Based)

#### Extract:

* Price filters
* Rating filters
* Delivery / Prime filters
* Brand filters (optional)

#### Example Output

&#96;&#96;&#96;json
[
  {
    "id": "f1",
    "type": "price",
    "label": "₹0 – ₹500",
    "element_ref": "DOM_NODE_REF"
  }
]
&#96;&#96;&#96;


> ❗ Entire DOM must NEVER be sent to LLM.

---

### 6.3 Filter Normalization

Convert UI labels → machine-usable metadata.

&#96;&#96;&#96;json
{
  "id": "f1",
  "type": "price",
  "min": 0,
  "max": 500
}
&#96;&#96;&#96;

---

## 7. Local LLM Usage (Client)

### 7.1 Allowed Use

✅ Semantic mapping only
❌ DOM parsing
❌ UI clicking
❌ Selector generation

### 7.2 Recommended Models

* Qwen2.5-7B (quantized)
* Phi-3-mini

### 7.3 LLM Input

&#96;&#96;&#96;json
{
  "intent": {
    "price_max": 500,
    "rating_min": 4,
    "delivery": "fast"
  },
  "available_filters": [
    { "id": "f1", "label": "Prime Eligible", "type": "delivery" },
    { "id": "f2", "label": "₹0 – ₹500", "type": "price" }
  ]
}
&#96;&#96;&#96;


### 7.4 LLM Output

&#96;&#96;&#96;json
{
  "apply_filters": ["f1", "f2"]
}
&#96;&#96;&#96;

---

## 8. Action Execution (Client)

### Rules

* Only click whitelisted elements
* Sequential execution
* Wait for DOM stability

&#96;&#96;&#96;ts
for (filter of apply_filters) {
  click(filter.element)
  await waitForPageStable()
}
&#96;&#96;&#96;

---

## 9. Guardrails (MANDATORY)

### 9.1 LLM Guardrails

* JSON schema validation
* Filter ID whitelist
* Max filters per run

### 9.2 UI Guardrails

* No clicks outside known filter containers
* Abort on CAPTCHA / login
* Human confirmation on CAPTCHA / login / OTP

### 9.3 Security

* No credential access
* No keystroke logging

---

## 10. Failure Handling

| Scenario            | Action                |
| ------------------- | --------------------- |
| Filter not found    | Skip                  |
| Page layout changed | Fallback to heuristic |
| LLM fails           | Use rule-based        |
| CAPTCHA detected    | Stop & notify         |

---

## 11. Test Cases

### 11.1 Intent Tests

* “Buy protein under 2k fast delivery”
* “Cheap white tshirt size XL”

### 11.2 DOM Tests

* Filter present / absent
* Label variations
* Lazy-loaded filters

### 11.3 LLM Tests

* Hallucinated filter IDs
* Empty outputs
* Partial matches

### 11.4 E2E

* Search → filters → results narrowed
* No checkout click without consent

---

## 12. Sample Implementation Pointers

### Backend

* FastAPI / Spring Boot
* Stateless LLM calls
* Redis + Neo4j + Vector DB

### Client

* Chrome Extension (MV3)
* MutationObserver
* Deterministic executor
* WebGPU local LLM runtime

---

## 13. Phased Delivery Plan

### Phase 1

* Assisted shopping
* Search + filters + compare

### Phase 2

* Cart + address automation
* Post-order tracking

### Phase 3

* Trusted autopilot (opt-in)
* Multi-platform optimization

---

## 14. Definition of Done

✔ No LLM-triggered clicks
✔ Works without DOM leaks
✔ Survives UI changes
✔ Human-in-loop checkout
✔ Clear audit logs

---

END OF SPEC

```
---
name: test-flow
description: End-to-end test with browser automation
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Write
  - mcp__playwright__browser_navigate
  - mcp__playwright__browser_snapshot
  - mcp__playwright__browser_click
  - mcp__playwright__browser_evaluate
  - mcp__playwright__browser_close
  - mcp__playwright__browser_take_screenshot
---

# Test Flow Skill - Full E2E with Playwright

This skill performs a 4-phase end-to-end test of the AI Commerce Agent with browser automation.

## Instructions

You are testing the AI Commerce Agent. Execute all 4 phases in sequence:

---

### Phase 1: API Health Check & Smoke Test (curl-based)

1. **Health Check**: Send GET to `http://localhost:8000/health`
   - Expected: `{"status": "ok"}` with HTTP 200

2. **Multi-Platform Intent Test**: Send POST to `http://localhost:8000/api/intent/multi`:
   ```json
   {"prompt": "white nike tshirt under 500 fast delivery"}
   ```
   - Expected: `raw_query`, `platforms[]` array with amazon and flipkart
   - Validate each platform has: `platform`, `search_url`, `filters[]`
   - Check for brand (Nike), price (Under ₹500), delivery (Prime) filters

**Commands:**
```bash
curl -s http://localhost:8000/health

curl -s -X POST http://localhost:8000/api/intent/multi \
  -H "Content-Type: application/json" \
  -d '{"prompt": "white nike tshirt under 500 fast delivery"}'
```

---

### Phase 2: Test API Documentation (Playwright)

1. Navigate to `http://localhost:8000/docs` (FastAPI Swagger UI)
2. Expand the POST `/api/intent/multi` endpoint
3. Click "Try it out" button
4. Enter test JSON:
   ```json
   {"prompt": "nike shoes under 2000"}
   ```
5. Click "Execute" button
6. Validate 200 response
7. Take screenshot: `test-api-docs.png`

---

### Phase 3: Test Search URL (Playwright)

1. Extract `search_url` from Phase 1 response for Amazon
2. Navigate to the Amazon search URL
3. Wait 3 seconds for page load
4. Verify Amazon results page loaded (check for product cards or "s-search-results")
5. Take screenshot: `test-amazon-results.png`

---

### Phase 4: Summary & Cleanup

1. Close all browser instances
2. Print pass/fail summary table:

| Phase | Test | Status | Details |
|-------|------|--------|---------|
| 1 | Health Check | PASS/FAIL | HTTP status |
| 1 | Multi-Platform Intent | PASS/FAIL | Platform count |
| 1 | Filter Extraction | PASS/FAIL | Filter count |
| 2 | API Docs Navigation | PASS/FAIL | Screenshot saved |
| 2 | Try It Out | PASS/FAIL | Response code |
| 3 | Amazon URL Navigation | PASS/FAIL | Page loaded |
| 3 | Products Visible | PASS/FAIL | Screenshot saved |

Print total: X/7 tests passed.

---

## Notes

- If Playwright MCP is not available, run Phase 1 only and report that browser tests are skipped
- Screenshots are saved to current directory
- Browser automation may take 10-15 seconds per phase
- Amazon may show CAPTCHA - report as known limitation if it happens

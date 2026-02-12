---
name: test-flow
description: Run an end-to-end test of the commerce agent flow
user-invocable: true
allowed-tools: Bash, Read, Write, mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_click, mcp__playwright__browser_type, mcp__playwright__browser_wait_for, mcp__playwright__browser_evaluate, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_close, mcp__playwright__browser_console_messages, mcp__playwright__browser_network_requests
---

# End-to-End Test Flow

Run a comprehensive end-to-end test of the commerce agent — first via API, then via the browser using Playwright.

Report results as a summary table at the end with test name, status (PASS/FAIL), and details.

## Phase 1: API Health & Smoke Test

1. Verify the backend is running at `http://localhost:8000/health`
   - If not running, report FAIL and stop — do not proceed to further tests
2. Send a test request via curl:
   ```bash
   curl -s -X POST http://localhost:8000/api/intent \
     -H "Content-Type: application/json" \
     -d '{"prompt": "white nike tshirt under 500 fast delivery"}'
   ```
3. Validate the response JSON contains:
   - `search_url` — must start with `https://www.amazon.in/s`
   - `filters` — must be a non-empty array, each with `type` and `value`
   - `raw_query` — must be a non-empty string

## Phase 2: Browser Test — Swagger UI

Use Playwright MCP tools to test the FastAPI Swagger docs interactively.

4. Navigate to `http://localhost:8000/docs`
5. Take a snapshot and verify the page loaded (look for "AI Commerce Agent" title)
6. Find and click the `POST /api/intent` endpoint to expand it
7. Click the "Try it out" button
8. Clear the request body textarea and type this JSON:
   ```json
   {"prompt": "blue adidas shoes under 2000"}
   ```
9. Click the "Execute" button
10. Wait for the response to appear (wait for text "200" in the response section)
11. Take a snapshot and extract the response body
12. Validate the response contains `search_url`, `filters`, and `raw_query`

## Phase 3: Browser Test — Search URL Navigation

13. Extract the `search_url` from the Swagger response
14. Navigate to the `search_url` in the browser
15. Take a snapshot to verify it loads an Amazon search results page
16. Take a screenshot and save it as `test-amazon-results.png`

## Phase 4: Cleanup

17. Close the browser
18. Print a summary table of all test results:

```
| #  | Test                        | Status | Details          |
|----|-----------------------------|--------|------------------|
| 1  | Backend health              | PASS   | ...              |
| 2  | API intent extraction       | PASS   | ...              |
| 3  | Swagger UI loads            | PASS   | ...              |
| 4  | Swagger try-it-out          | PASS   | ...              |
| 5  | Swagger response valid      | PASS   | ...              |
| 6  | Amazon search page loads    | PASS   | ...              |
```

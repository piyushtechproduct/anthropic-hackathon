---
name: test-flow
description: End-to-end test of the commerce agent
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Write
---

# Test Flow Skill

This skill performs an end-to-end test of the AI Commerce Agent backend.

## Instructions

You are testing the AI Commerce Agent API. Follow these steps:

### Phase 1: API Health Check & Smoke Test

1. **Health Check**: Send a GET request to `http://localhost:8000/health`
   - Expected: `{"status": "ok"}` with HTTP 200

2. **Intent Extraction Test**: Send a POST request to `http://localhost:8000/api/intent` with:
   ```json
   {
     "prompt": "white nike tshirt under 500 fast delivery"
   }
   ```
   - Expected response fields: `search_url`, `filters[]`, `raw_query`
   - Validate that `search_url` contains `amazon.in/s?k=`
   - Validate that filters array is not empty
   - Check for brand filter (Nike), price filter (Under ₹500), delivery filter (Prime)

3. **Report Results**: Print a pass/fail summary with:
   - Health check status
   - Intent extraction status
   - Number of filters extracted
   - Search URL validation

Use `curl` for all API calls. Format output as a table showing test results.

**Example curl commands:**
```bash
curl -s http://localhost:8000/health

curl -s -X POST http://localhost:8000/api/intent \
  -H "Content-Type: application/json" \
  -d '{"prompt": "white nike tshirt under 500 fast delivery"}'
```

Print clear pass/fail status for each test phase.

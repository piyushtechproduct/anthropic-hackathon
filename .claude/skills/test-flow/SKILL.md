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

"""System prompts for each test category sent to Claude API."""

from src.qa_agent.models import TestCategory

BASE_SYSTEM_PROMPT = """You are a QA test generation expert. You generate production-quality, runnable test files.

OUTPUT FORMAT:
For each file, output a header line and then a fenced code block:

### FILE: <filename>
```python
<complete file content>
```

(Use ```typescript for .ts files.)

Do NOT output JSON. Do NOT wrap everything in a single code block. Each file MUST have its own ### FILE: header and its own code block.

RULES:
1. Every generated Python test file MUST:
   - Use pytest and pytest-asyncio
   - Mock the Anthropic client using: unittest.mock.patch("src.app.services.anthropic.Anthropic")
   - Use httpx.AsyncClient with ASGITransport for API testing
   - Import the app from src.app.main
   - Follow the exact mock pattern: mock_message = MagicMock(); mock_message.content = [MagicMock(text=json.dumps(response_data))]
   - NEVER make real API calls
   - Include proper async test functions decorated with @pytest.mark.asyncio
2. Every generated TypeScript test file MUST:
   - Use vitest (import { describe, it, expect } from "vitest")
   - Test pure utility functions only (no DOM mocking)
   - Use .test.ts extension
3. Do NOT duplicate tests that already exist (existing tests are provided as context).
4. Each test function should have a clear, descriptive name.
5. Include at least 5 test functions per file.
"""

CATEGORY_PROMPTS: dict[TestCategory, str] = {
    TestCategory.BACKEND_API: """Generate backend API tests focusing on edge cases and robustness:

TEST FILE 1: test_intent_edge_cases_gen.py
- Empty prompt string → should return 422 or handle gracefully
- Very long prompt (1000+ chars) → should still work
- Special characters in prompt (emoji, unicode, HTML tags)
- Claude response wrapped in markdown fences (```json ... ```) → should strip and parse
- Claude response with extra whitespace → should parse
- Response missing required fields → should return 500
- All filter types covered: brand, price, delivery, rating, color, size, discount

TEST FILE 2: test_rank_edge_cases_gen.py
- Fewer than 5 products → returns all
- Exactly 5 products → returns all
- Products with zero price → score handles division
- Products with null ratings → handled gracefully
- LLM returns invalid indices → falls back to deterministic sort
- LLM returns fewer than 3 valid indices → falls back
- Empty product list → returns empty
- Products with very large review counts""",
    TestCategory.SECURITY: """Generate security tests:

TEST FILE: test_security_gen.py
- XSS payloads in prompt field (<script>alert(1)</script>) → should not appear in response
- SQL injection strings in prompt → handled safely
- Prompt injection attempts ("ignore previous instructions...") → response still valid JSON schema
- Very large payload (100KB+ prompt) → returns 413 or handles gracefully
- CORS headers present in response
- Error responses don't leak internal details (no stack traces, no API keys)
- API key not present in any response body or headers
- Response always conforms to IntentResponse schema even on edge inputs
- Unicode/null byte injection in prompts
- Content-Type enforcement (sending non-JSON body → 422)""",
    TestCategory.PERFORMANCE: """Generate performance tests:

TEST FILE: test_performance_gen.py
- Health endpoint responds in < 100ms
- Concurrent requests (use asyncio.gather with 10 simultaneous intent requests)
- Large payload handling: rank endpoint with 50 products
- Rank endpoint with 100 products still returns within timeout
- Sequential rapid requests (10 back-to-back) all succeed
- Response size is reasonable (< 10KB for intent, < 50KB for rank)
- Multi-platform intent endpoint works under concurrent load

Important: All tests must mock the Anthropic client. Performance tests measure the framework overhead, not actual LLM latency.""",
    TestCategory.E2E: """Generate end-to-end flow tests:

TEST FILE: test_e2e_flow_gen.py
- Full flow: prompt → intent extraction → verify URL format and filters
- Multi-platform: same prompt produces both amazon and flipkart results
- Price format validation: "Under ₹X" format in filters
- Delivery mapping: "fast delivery" → Prime (amazon) and Flipkart Assured (flipkart)
- Brand extraction: brand name appears in both raw_query-related context and filters
- Rating filter: "good ratings" → "4★ & up"
- Discount filter: "deals" → "10% off or more"
- Complex prompt with multiple filters → all extracted correctly
- Rank endpoint: given products from both platforms, returns top 5 with platform diversity
- Multi-platform intent + rank pipeline: extract intent → mock products → rank""",
    TestCategory.EXTENSION: """Generate extension utility tests:

TEST FILE: adapters.test.ts (for extension/tests/generated/)
Test the pure utility functions exported from src/adapters/utils.ts:

extractPriceNumber:
- "Under ₹500" → 500
- "₹1,500" → 1500
- "Under ₹15,000" → 15000
- "no price" → null
- "" → null

formatIndianNumber:
- 500 → "500"
- 1500 → "1,500"
- 150000 → "1,50,000"
- 1500000 → "15,00,000"
- 0 → "0"

parsePriceText:
- "₹1,499" → 1499
- "₹ 2,999" → 2999
- "abc" → 0
- "" → 0

parseReviewCount:
- "1,234" → 1234
- "50" → 50
- "" → null
- null → null (handle empty string)

matchPrice:
- ("up to ₹500", "under ₹500") → true
- ("up to ₹1,500", "under ₹1500") → true
- ("₹500 - ₹1,000", "₹500-₹1000") → true
- ("random text", "under ₹500") → false

getSectionIdForFilter:
- "brand" → "brandsRefinements"
- "price" → "priceRefinements"
- "unknown" → null""",
}


def get_system_prompt(category: TestCategory) -> str:
    """Return the full system prompt for a given test category."""
    return BASE_SYSTEM_PROMPT + "\n\n" + CATEGORY_PROMPTS[category]

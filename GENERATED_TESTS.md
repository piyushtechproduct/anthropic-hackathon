# Generated Test Index

Auto-generated test suite for the AI Commerce Agent, produced by the **QA Agent** (`qa-gen` skill).

## Summary

| Metric | Count |
|--------|-------|
| Total tests | **106** |
| Backend (Python / Pytest) | 56 |
| Extension (TypeScript / Vitest) | 50 |

### By category

| Category | File | Tests |
|----------|------|------:|
| Backend API — Intent Edge Cases | `backend/tests/generated/test_intent_edge_cases_gen.py` | 8 |
| Backend API — Rank Edge Cases | `backend/tests/generated/test_rank_edge_cases_gen.py` | 11 |
| Security | `backend/tests/generated/test_security_gen.py` | 14 |
| Performance | `backend/tests/generated/test_performance_gen.py` | 9 |
| E2E Flow | `backend/tests/generated/test_e2e_flow_gen.py` | 14 |
| Extension — Adapter Utilities | `extension/tests/generated/adapters.test.ts` | 50 |

---

## Running the tests

```bash
# Backend (56 tests)
cd backend && uv run pytest tests/generated/ -v

# Extension (50 tests)
cd extension && npx vitest run tests/generated/
```

## Regenerating

```bash
# From the project root, invoke the QA Agent skill:
#   /qa-gen
# This reads the PRD docs and source code and overwrites the files above.
```

---

## Detailed test listing

### `backend/tests/generated/test_intent_edge_cases_gen.py` — Backend API (8 tests)

| # | Function | Description |
|---|----------|-------------|
| 1 | `test_intent_empty_prompt` | Empty prompt is accepted by FastAPI (no str length validation) |
| 2 | `test_intent_very_long_prompt` | Very long prompt (1 000+ chars) still returns 200 with valid data |
| 3 | `test_intent_special_characters` | Emoji, unicode, and HTML tags in prompt are handled safely |
| 4 | `test_intent_markdown_fences_stripped` | Claude response wrapped in markdown fences is stripped and parsed |
| 5 | `test_intent_response_with_extra_whitespace` | Claude response with extra whitespace parses correctly |
| 6 | `test_intent_missing_required_fields_returns_500` | Claude response missing required fields returns 500 |
| 7 | `test_intent_all_filter_types` | Response with all 7 filter types is parsed correctly |
| 8 | `test_intent_invalid_json_from_claude` | Claude returning invalid JSON results in 500 |

### `backend/tests/generated/test_rank_edge_cases_gen.py` — Backend API (11 tests)

| # | Function | Description |
|---|----------|-------------|
| 1 | `test_rank_fewer_than_five_products` | Fewer than 5 products returns all without LLM call |
| 2 | `test_rank_exactly_five_products` | Exactly 5 products returns all without LLM call |
| 3 | `test_rank_products_with_zero_price` | Products with zero price are handled in scoring |
| 4 | `test_rank_products_with_null_ratings` | Products with null ratings are handled gracefully |
| 5 | `test_rank_llm_returns_invalid_indices` | Invalid LLM indices trigger deterministic fallback |
| 6 | `test_rank_llm_returns_fewer_than_three_valid_indices` | Fewer than 3 valid LLM indices trigger fallback |
| 7 | `test_rank_empty_product_list` | Empty product list returns empty ranked list |
| 8 | `test_rank_products_with_very_large_review_counts` | Very large review counts are scored correctly |
| 9 | `test_rank_deterministic_score_calculation` | Deterministic scoring formula (rating * log(reviews+1)) / price |
| 10 | `test_rank_llm_returns_malformed_json` | Malformed JSON from LLM triggers fallback |
| 11 | `test_rank_products_with_null_review_counts` | Null review counts are handled gracefully |

### `backend/tests/generated/test_security_gen.py` — Security (14 tests)

| # | Function | Description |
|---|----------|-------------|
| 1 | `test_xss_payload_in_prompt_field` | XSS payloads (5 vectors) do not appear unescaped in response |
| 2 | `test_sql_injection_in_prompt_handled_safely` | SQL injection strings (5 vectors) are handled without errors |
| 3 | `test_prompt_injection_returns_valid_schema` | Prompt injection attempts (5 vectors) still return valid schema |
| 4 | `test_very_large_payload_handling` | 100 KB+ prompt is rejected or handled gracefully |
| 5 | `test_cors_headers_present` | CORS `access-control-allow-origin: *` header is present |
| 6 | `test_error_responses_no_stack_trace_leak` | Error responses do not leak stack traces |
| 7 | `test_api_key_not_in_response` | API key never appears in response body or headers |
| 8 | `test_unicode_injection_in_prompt` | Unicode edge cases (null byte, BOM, RTL override, emoji, multi-lang) |
| 9 | `test_content_type_enforcement` | Non-JSON body returns 422 |
| 10 | `test_malformed_json_rejected` | Malformed JSON body returns 422 |
| 11 | `test_missing_required_field_rejected` | Missing `prompt` field returns 422 |
| 12 | `test_response_conforms_to_schema_on_edge_input` | Edge inputs (empty, whitespace, single char, repeated special) conform to schema |
| 13 | `test_rank_endpoint_xss_in_query` | XSS payloads in rank query are handled safely |
| 14 | `test_multi_intent_xss_payload` | XSS payloads in multi-intent endpoint are handled safely |

### `backend/tests/generated/test_performance_gen.py` — Performance (9 tests)

| # | Function | Description |
|---|----------|-------------|
| 1 | `test_health_endpoint_responds_under_100ms` | Health endpoint responds in under 100 ms |
| 2 | `test_concurrent_intent_requests` | 10 simultaneous intent requests all succeed within 5 s |
| 3 | `test_large_payload_rank_50_products` | Rank endpoint handles 50 products within 5 s |
| 4 | `test_rank_100_products_within_timeout` | Rank endpoint handles 100 products within 10 s |
| 5 | `test_sequential_rapid_requests_all_succeed` | 10 back-to-back sequential requests all succeed within 10 s |
| 6 | `test_response_size_is_reasonable_for_intent` | Intent response payload is under 10 KB |
| 7 | `test_response_size_is_reasonable_for_rank` | Rank response payload (50 products) is under 50 KB |
| 8 | `test_multi_platform_intent_under_concurrent_load` | 10 concurrent multi-platform intent requests succeed within 5 s |
| 9 | `test_health_endpoint_minimal_overhead` | Average health-check latency over 100 iterations is under 10 ms |

### `backend/tests/generated/test_e2e_flow_gen.py` — E2E Flow (14 tests)

| # | Function | Description |
|---|----------|-------------|
| 1 | `test_full_flow_prompt_to_intent_to_url_validation` | Full prompt → intent → URL format and filter validation |
| 2 | `test_multi_platform_same_prompt_produces_both_results` | Same prompt produces both Amazon and Flipkart results |
| 3 | `test_price_format_validation_under_rupee_x` | Price filter uses "Under ₹X" format |
| 4 | `test_delivery_mapping_fast_delivery_to_prime_and_assured` | "fast delivery" maps to Prime (Amazon) and Flipkart Assured |
| 5 | `test_brand_extraction_appears_in_query_and_filters` | Brand name appears in raw_query and filters for both platforms |
| 6 | `test_rating_filter_good_ratings_to_4_star_up` | "good ratings" maps to "4★ & up" |
| 7 | `test_discount_filter_deals_to_10_percent_off` | "deals" maps to "10% off or more" |
| 8 | `test_complex_prompt_multiple_filters_all_extracted` | Complex multi-filter prompt extracts all expected filter types |
| 9 | `test_rank_endpoint_returns_top_5_with_platform_diversity` | Rank returns top 5 with platform diversity |
| 10 | `test_multi_platform_intent_plus_rank_pipeline` | Multi-step intent → rank pipeline works end-to-end |
| 11 | `test_end_to_end_flow_with_no_filters` | Prompt with no specific filters still returns valid structure |
| 12 | `test_rank_preserves_product_metadata` | Rank preserves all product fields and types |
| 13 | `test_filter_types_match_spec` | All 7 spec filter types are returned correctly |
| 14 | `test_url_encoding_with_special_characters` | Search URLs have no raw spaces (use + or %20) |

### `extension/tests/generated/adapters.test.ts` — Extension Adapter Utilities (50 tests)

#### `extractPriceNumber` (7 tests)

| # | Test | Description |
|---|------|-------------|
| 1 | should extract price from 'Under ₹500' format | Parses "Under ₹500" → 500 |
| 2 | should extract price from formatted amount '₹1,500' | Parses "₹1,500" → 1500 |
| 3 | should extract price from 'Under ₹15,000' format | Parses "Under ₹15,000" → 15000 |
| 4 | should return null for text with no price | Returns null for non-numeric text |
| 5 | should return null for empty string | Returns null for "" |
| 6 | should extract first number from complex strings | Extracts 2500 from "Price range ₹2,500 to ₹5,000" |
| 7 | should handle price without commas | Parses "₹999" → 999 |

#### `formatIndianNumber` (8 tests)

| # | Test | Description |
|---|------|-------------|
| 1 | should format small number without commas | 500 → "500" |
| 2 | should format four-digit number with comma | 1500 → "1,500" |
| 3 | should format six-digit number in Indian style | 150000 → "1,50,000" |
| 4 | should format seven-digit number in Indian style | 1500000 → "15,00,000" |
| 5 | should format zero correctly | 0 → "0" |
| 6 | should format three-digit number correctly | 999 → "999" |
| 7 | should format five-digit number correctly | 12345 → "12,345" |
| 8 | should format eight-digit number in Indian style | 12345678 → "1,23,45,678" |

#### `parsePriceText` (8 tests)

| # | Test | Description |
|---|------|-------------|
| 1 | should parse formatted price '₹1,499' | "₹1,499" → 1499 |
| 2 | should parse price with spaces '₹ 2,999' | "₹ 2,999" → 2999 |
| 3 | should return 0 for non-numeric text | "abc" → 0 |
| 4 | should return 0 for empty string | "" → 0 |
| 5 | should parse price without rupee symbol | "5,999" → 5999 |
| 6 | should parse decimal prices correctly | "₹1,499.50" → 1499.5 |
| 7 | should handle price with multiple spaces | "₹  3,  500" → 3500 |
| 8 | should parse large formatted prices | "₹12,34,567" → 1234567 |

#### `parseReviewCount` (7 tests)

| # | Test | Description |
|---|------|-------------|
| 1 | should parse formatted review count '1,234' | "1,234" → 1234 |
| 2 | should parse simple review count '50' | "50" → 50 |
| 3 | should return null for empty string | "" → null |
| 4 | should handle review count with spaces | "5 678" → 5678 |
| 5 | should parse large review counts | "1,23,456" → 123456 |
| 6 | should extract first number from text with reviews | "Based on 999 customer reviews" → 999 |
| 7 | should return null for text without numbers | "No reviews" → null |

#### `matchPrice` (10 tests)

| # | Test | Description |
|---|------|-------------|
| 1 | should match 'up to' format with 'under' filter | "up to ₹500" vs "under ₹500" → true |
| 2 | should match 'up to' format with 'under' filter for larger amount | "up to ₹1,500" vs "under ₹1500" → true |
| 3 | should match price range format | "₹500 - ₹1,000" vs "₹500-₹1000" → true |
| 4 | should not match unrelated text | "random text" vs "under ₹500" → false |
| 5 | should match range upper bound with 'under' filter | "₹0 - ₹500" vs "under ₹500" → true |
| 6 | should not match if price numbers differ | "up to ₹1,000" vs "under ₹500" → false |
| 7 | should match formatted price with commas | "up to ₹1,500" vs "under ₹1,500" → true |
| 8 | should match price range with spaces | "₹ 1,000 - ₹ 2,000" vs "₹1000-₹2000" → true |
| 9 | should return false for invalid filter value | "up to ₹500" vs "invalid price" → false |
| 10 | should handle range without rupee symbols in filter | "₹500 - ₹1,000" vs "500-1000" → true |

#### `getSectionIdForFilter` (10 tests)

| # | Test | Description |
|---|------|-------------|
| 1 | should return correct section ID for brand filter | "brand" → "brandsRefinements" |
| 2 | should return correct section ID for price filter | "price" → "priceRefinements" |
| 3 | should return null for unknown filter type | "unknown" → null |
| 4 | should return correct section ID for delivery filter | "delivery" → "deliveryRefinements" |
| 5 | should return correct section ID for rating filter | "rating" → "reviewsRefinements" |
| 6 | should return correct section ID for size filter | "size" → "sizeRefinements" |
| 7 | should return correct section ID for color filter | "color" → "size_two_browse" |
| 8 | should return correct section ID for colour filter (UK spelling) | "colour" → "size_two_browse" |
| 9 | should return correct section ID for discount filter | "discount" → "pct-off" |
| 10 | should handle case-insensitive filter types | "BRAND" / "Price" → correct IDs |

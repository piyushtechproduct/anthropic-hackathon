#!/bin/bash

# AI Commerce Agent - End-to-End Test Script
# Tests backend API and validates extension build

set -e  # Exit on error

echo "========================================"
echo "AI Commerce Agent - E2E Test Suite"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

# Test 1: Health Check
echo "Test 1: Health Check"
HEALTH_RESPONSE=$(curl -s http://localhost:8000/health)
if echo "$HEALTH_RESPONSE" | grep -q "\"status\":\"ok\""; then
    echo -e "${GREEN}✓ PASS${NC} - Backend is healthy"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} - Backend health check failed"
    echo "Response: $HEALTH_RESPONSE"
    ((FAILED++))
fi
echo ""

# Test 2: Single Platform Intent Extraction
echo "Test 2: Single Platform Intent Extraction"
INTENT_RESPONSE=$(curl -s -X POST http://localhost:8000/api/intent \
    -H "Content-Type: application/json" \
    -d '{"prompt": "white nike tshirt under 500"}')

if echo "$INTENT_RESPONSE" | grep -q "search_url" && \
   echo "$INTENT_RESPONSE" | grep -q "filters" && \
   echo "$INTENT_RESPONSE" | grep -q "amazon.in"; then
    echo -e "${GREEN}✓ PASS${NC} - Intent extraction working"
    FILTER_COUNT=$(echo "$INTENT_RESPONSE" | grep -o "\"type\"" | wc -l)
    echo "  Extracted $FILTER_COUNT filters"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} - Intent extraction failed"
    echo "Response: $INTENT_RESPONSE"
    ((FAILED++))
fi
echo ""

# Test 3: Multi-Platform Intent Extraction
echo "Test 3: Multi-Platform Intent Extraction"
MULTI_RESPONSE=$(curl -s -X POST http://localhost:8000/api/intent/multi \
    -H "Content-Type: application/json" \
    -d '{"prompt": "nike shoes under 2000"}')

AMAZON_COUNT=$(echo "$MULTI_RESPONSE" | grep -o "amazon" | wc -l)
FLIPKART_COUNT=$(echo "$MULTI_RESPONSE" | grep -o "flipkart" | wc -l)

if [ "$AMAZON_COUNT" -gt 0 ] && [ "$FLIPKART_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ PASS${NC} - Multi-platform extraction working"
    echo "  Found: Amazon ✓, Flipkart ✓"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} - Multi-platform extraction incomplete"
    echo "  Amazon mentions: $AMAZON_COUNT, Flipkart mentions: $FLIPKART_COUNT"
    ((FAILED++))
fi
echo ""

# Test 4: Backend Tests
echo "Test 4: Backend Unit Tests"
cd backend
TEST_OUTPUT=$(uv run pytest -v 2>&1)
if echo "$TEST_OUTPUT" | grep -q "passed"; then
    echo -e "${GREEN}✓ PASS${NC} - Backend tests passing"
    echo "$TEST_OUTPUT" | grep "passed"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} - Backend tests failed"
    echo "$TEST_OUTPUT"
    ((FAILED++))
fi
cd ..
echo ""

# Test 5: Extension Build
echo "Test 5: Extension Build"
cd extension
npm run build > /dev/null 2>&1
if [ -f "dist/background.js" ] && \
   [ -f "dist/content.js" ] && \
   [ -f "dist/sidepanel.js" ] && \
   [ -f "dist/manifest.json" ] && \
   [ -f "dist/sidepanel.html" ]; then
    echo -e "${GREEN}✓ PASS${NC} - Extension build successful"
    echo "  All artifacts present:"
    ls -lh dist/*.js dist/*.json dist/*.html | awk '{print "    " $9 " (" $5 ")"}'
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} - Extension build incomplete"
    ls -l dist/
    ((FAILED++))
fi
cd ..
echo ""

# Summary
echo "========================================"
echo "Test Summary"
echo "========================================"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo "Total:  $((PASSED + FAILED))"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi

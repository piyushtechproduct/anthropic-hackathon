import json
import logging
import math
import os
import re

import anthropic

from src.app.models import (
    IntentResponse,
    MultiPlatformIntentResponse,
    Product,
)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a shopping intent extraction assistant for Amazon India (amazon.in).

Given a user's natural language shopping request, extract the structured intent and return ONLY a JSON object with no other text.

The JSON must have exactly these fields:
- "raw_query": cleaned search terms suitable for Amazon search (e.g., "white nike tshirt")
- "search_url": Amazon India search URL using https://www.amazon.in/s?k=<query> with query terms joined by +
- "filters": array of filter objects, each with "type" and "value"

Available filter types and how to map them:
- "brand": extract brand names (e.g., Nike, Samsung, Adidas)
- "price": price constraints. Use "Under ₹X" format for upper bounds (e.g., "Under ₹500", "Under ₹15,000")
- "delivery": if user mentions "fast delivery", "quick delivery", or "prime", use {"type": "delivery", "value": "Prime"}
- "rating": if user mentions "good ratings" or "highly rated", use {"type": "rating", "value": "4★ & up"}
- "color": extract color mentions (e.g., "White", "Blue", "Black")
- "size": extract size mentions (e.g., "XL", "Size 10", "32")
- "discount": if user mentions deals or discounts, use {"type": "discount", "value": "10% off or more"}

Rules:
- Return ONLY the JSON object, no markdown, no explanation
- If no filters can be extracted, return an empty filters array
- Always generate a valid search_url
- Keep raw_query concise — just the core product search terms

Example input: "white nike tshirt under 500 fast delivery"
Example output:
{"raw_query": "white nike tshirt", "search_url": "https://www.amazon.in/s?k=white+nike+tshirt", "filters": [{"type": "brand", "value": "Nike"}, {"type": "price", "value": "Under ₹500"}, {"type": "delivery", "value": "Prime"}, {"type": "color", "value": "White"}]}"""


def extract_intent(prompt: str) -> IntentResponse:
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    message = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    response_text = message.content[0].text
    logger.info("Claude raw response: %s", response_text)

    # Strip markdown code fences if present
    cleaned = response_text.strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    data = json.loads(cleaned)

    return IntentResponse(**data)


MULTI_PLATFORM_SYSTEM_PROMPT = """You are a shopping intent extraction assistant for Indian e-commerce platforms.

Given a user's natural language shopping request, extract the structured intent for BOTH Amazon India (amazon.in) AND Flipkart (flipkart.com). Return ONLY a JSON object with no other text.

The JSON must have exactly these fields:
- "raw_query": cleaned search terms (e.g., "white nike tshirt")
- "platforms": array of two objects, one for Amazon and one for Flipkart, each with:
  - "platform": either "amazon" or "flipkart"
  - "search_url": platform-specific search URL
    - Amazon: https://www.amazon.in/s?k=<query> with query terms joined by +
    - Flipkart: https://www.flipkart.com/search?q=<query> with query terms joined by +
  - "filters": array of filter objects, each with "type" and "value"

Available filter types:
- "brand": brand names (e.g., Nike, Samsung)
- "price": price constraints using "Under ₹X" format (e.g., "Under ₹500")
- "delivery": fast delivery → for Amazon use {"type": "delivery", "value": "Prime"}, for Flipkart use {"type": "delivery", "value": "Flipkart Assured"}
- "rating": good ratings → {"type": "rating", "value": "4★ & up"}
- "color": color mentions (e.g., "White", "Blue")
- "size": size mentions (e.g., "XL", "Size 10")
- "discount": deals/discounts → {"type": "discount", "value": "10% off or more"}

Rules:
- Return ONLY the JSON object, no markdown, no explanation
- Always include both platforms in the response
- Both platforms get the same filters EXCEPT delivery: use "Prime" for Amazon and "Flipkart Assured" for Flipkart
- Keep raw_query concise — just the core product search terms

Example input: "white nike tshirt under 500"
Example output:
{"raw_query": "white nike tshirt", "platforms": [{"platform": "amazon", "search_url": "https://www.amazon.in/s?k=white+nike+tshirt", "filters": [{"type": "brand", "value": "Nike"}, {"type": "price", "value": "Under ₹500"}, {"type": "color", "value": "White"}]}, {"platform": "flipkart", "search_url": "https://www.flipkart.com/search?q=white+nike+tshirt", "filters": [{"type": "brand", "value": "Nike"}, {"type": "price", "value": "Under ₹500"}, {"type": "color", "value": "White"}]}]}"""


def extract_multi_platform_intent(prompt: str) -> MultiPlatformIntentResponse:
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    message = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=1024,
        system=MULTI_PLATFORM_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    response_text = message.content[0].text
    logger.info("Claude multi-platform raw response: %s", response_text)

    cleaned = response_text.strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    data = json.loads(cleaned)

    return MultiPlatformIntentResponse(**data)


RANK_SYSTEM_PROMPT = """You are a product ranking assistant. Given a user's shopping query and a list of products from multiple platforms, pick the BEST 5 products.

Rank based on:
1. Relevance to the query
2. Value for money (lower price for similar quality)
3. Ratings and review count (more reviews = more trustworthy)
4. Platform diversity (try to include products from both platforms if quality is similar)

Return ONLY a JSON object with a single field "indices" — an array of exactly 5 zero-based indices from the product list, ordered from best to worst.

Example: {"indices": [3, 0, 7, 12, 5]}

Rules:
- Return ONLY the JSON, no markdown, no explanation
- Always return exactly 5 indices (or fewer if fewer than 5 products were provided)
- Indices must be valid (within bounds of the product list)"""


def rank_products(query: str, products: list[Product]) -> list[Product]:
    if len(products) <= 5:
        return products

    # Build numbered product list for the LLM
    product_lines = []
    for i, p in enumerate(products):
        rating_str = f"{p.rating}★" if p.rating else "no rating"
        reviews_str = f"{p.review_count} reviews" if p.review_count else "no reviews"
        product_lines.append(
            f"[{i}] {p.title} — ₹{p.price:.0f} — {rating_str} ({reviews_str}) — {p.platform}"
        )
    product_text = "\n".join(product_lines)

    user_message = f"Query: {query}\n\nProducts:\n{product_text}"

    try:
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

        message = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=256,
            system=RANK_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )

        response_text = message.content[0].text
        logger.info("Claude rank raw response: %s", response_text)

        cleaned = response_text.strip()
        fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
        if fence_match:
            cleaned = fence_match.group(1).strip()

        data = json.loads(cleaned)
        indices = data.get("indices", [])

        # Validate indices
        valid_indices = [
            i for i in indices if isinstance(i, int) and 0 <= i < len(products)
        ]
        if len(valid_indices) >= 3:
            return [products[i] for i in valid_indices[:5]]

        logger.warning(
            "LLM returned insufficient valid indices, falling back to deterministic sort"
        )
    except Exception:
        logger.exception("LLM ranking failed, falling back to deterministic sort")

    # Deterministic fallback: score = (rating * log(reviews + 1)) / price
    def score(p: Product) -> float:
        r = p.rating if p.rating else 0
        rc = p.review_count if p.review_count else 0
        if p.price <= 0:
            return 0
        return (r * math.log(rc + 1)) / p.price

    sorted_products = sorted(products, key=score, reverse=True)
    return sorted_products[:5]

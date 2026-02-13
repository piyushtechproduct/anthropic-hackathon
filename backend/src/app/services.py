"""
Services for AI-powered intent extraction and product ranking
"""
import os
import json
import re
from typing import List
from anthropic import Anthropic
from .models import IntentResponse, Filter, MultiPlatformIntentResponse, PlatformIntent, Platform, Product


# Initialize Anthropic client
client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
MODEL = "claude-sonnet-4-5-20250929"


def strip_markdown_fences(text: str) -> str:
    """Remove markdown code fences from Claude's response"""
    # Remove ```json ... ``` or ``` ... ```
    text = re.sub(r'^```(?:json)?\s*\n', '', text, flags=re.MULTILINE)
    text = re.sub(r'\n```\s*$', '', text, flags=re.MULTILINE)
    return text.strip()


def extract_intent(prompt: str) -> IntentResponse:
    """
    Extract shopping intent from natural language prompt.
    Returns search URL and filters for Amazon India.
    """
    system_prompt = """You are an e-commerce intent extraction system for Amazon India.

Given a natural language shopping query, extract:
1. raw_query: The core product search term (remove filter constraints)
2. search_url: Amazon India search URL in format: https://www.amazon.in/s?k={query}
3. filters: Array of filter objects with type and value

Filter types:
- brand: Brand name (e.g., "Nike", "Samsung")
- price: Format as "Under ₹X" (e.g., "Under ₹500")
- delivery: Use "Prime" for fast delivery
- rating: Format as "X★ & up" (e.g., "4★ & up")
- color: Color name (e.g., "White", "Black")
- size: Size value (e.g., "10", "M", "Large")
- discount: Format as "X% off or more" (e.g., "50% off or more")

Return valid JSON only, no markdown fences.

Example input: "white nike tshirt under 500 fast delivery"
Example output:
{
  "raw_query": "nike tshirt",
  "search_url": "https://www.amazon.in/s?k=nike+tshirt",
  "filters": [
    {"type": "brand", "value": "Nike"},
    {"type": "color", "value": "White"},
    {"type": "price", "value": "Under ₹500"},
    {"type": "delivery", "value": "Prime"}
  ]
}"""

    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=system_prompt,
        messages=[
            {"role": "user", "content": prompt}
        ]
    )

    # Extract text from response
    response_text = response.content[0].text

    # Strip markdown code fences if present
    response_text = strip_markdown_fences(response_text)

    # Parse JSON
    data = json.loads(response_text)

    # Convert to Pydantic model
    return IntentResponse(
        search_url=data["search_url"],
        filters=[Filter(**f) for f in data.get("filters", [])],
        raw_query=data["raw_query"]
    )


def extract_multi_platform_intent(prompt: str) -> MultiPlatformIntentResponse:
    """
    Extract shopping intent for multiple platforms (Amazon + Flipkart).
    Returns per-platform search URLs and filters.
    """
    system_prompt = """You are an e-commerce intent extraction system for Amazon India and Flipkart.

Given a natural language shopping query, extract intent for BOTH platforms:

Return JSON with:
- raw_query: Core product search term (same for both platforms)
- platforms: Array of platform intents

For each platform:
- platform: "amazon" or "flipkart"
- search_url: Platform-specific search URL
  - Amazon: https://www.amazon.in/s?k={query}
  - Flipkart: https://www.flipkart.com/search?q={query}
- filters: Array of filter objects (platform-specific delivery filters)

Filter types:
- brand, price, rating, color, size, discount (same for both platforms)
- delivery: Use "Prime" for Amazon, "Flipkart Assured" for Flipkart

Return valid JSON only, no markdown fences.

Example input: "white nike tshirt under 500 fast delivery"
Example output:
{
  "raw_query": "nike tshirt",
  "platforms": [
    {
      "platform": "amazon",
      "search_url": "https://www.amazon.in/s?k=nike+tshirt",
      "filters": [
        {"type": "brand", "value": "Nike"},
        {"type": "color", "value": "White"},
        {"type": "price", "value": "Under ₹500"},
        {"type": "delivery", "value": "Prime"}
      ]
    },
    {
      "platform": "flipkart",
      "search_url": "https://www.flipkart.com/search?q=nike+tshirt",
      "filters": [
        {"type": "brand", "value": "Nike"},
        {"type": "color", "value": "White"},
        {"type": "price", "value": "Under ₹500"},
        {"type": "delivery", "value": "Flipkart Assured"}
      ]
    }
  ]
}"""

    response = client.messages.create(
        model=MODEL,
        max_tokens=2048,
        system=system_prompt,
        messages=[
            {"role": "user", "content": prompt}
        ]
    )

    # Extract and clean response
    response_text = strip_markdown_fences(response.content[0].text)
    data = json.loads(response_text)

    # Convert to Pydantic model
    return MultiPlatformIntentResponse(
        raw_query=data["raw_query"],
        platforms=[
            PlatformIntent(
                platform=Platform(p["platform"]),
                search_url=p["search_url"],
                filters=[Filter(**f) for f in p.get("filters", [])]
            )
            for p in data["platforms"]
        ]
    )


def rank_products(query: str, products: List[Product]) -> List[Product]:
    """
    Rank products by relevance, value, and ratings using Claude API.
    Falls back to deterministic scoring if API fails.
    """
    if len(products) <= 5:
        return products

    try:
        system_prompt = """You are a product ranking system.

Given a search query and list of products, rank them by:
1. Relevance to query
2. Value for money (price vs features)
3. Ratings and reviews
4. Platform diversity (mix of Amazon and Flipkart)

Return the indices of the top 5 products in ranked order.

Return JSON only: {"indices": [0, 3, 1, 4, 2]}"""

        products_summary = [
            f"{i}. {p.title[:100]} - ₹{p.price} - {p.rating}★ ({p.review_count} reviews) - {p.platform}"
            for i, p in enumerate(products)
        ]

        user_message = f"Query: {query}\n\nProducts:\n" + "\n".join(products_summary)

        response = client.messages.create(
            model=MODEL,
            max_tokens=256,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}]
        )

        response_text = strip_markdown_fences(response.content[0].text)
        data = json.loads(response_text)
        indices = data["indices"][:5]

        # Validate indices
        if all(0 <= idx < len(products) for idx in indices):
            return [products[i] for i in indices]

    except Exception:
        pass  # Fall back to deterministic ranking

    # Deterministic fallback: score = (rating × log(reviewCount + 1)) / price
    import math
    scored = [
        (p, (p.rating * math.log(p.review_count + 1)) / max(p.price, 1))
        for p in products
    ]
    scored.sort(key=lambda x: x[1], reverse=True)
    return [p for p, _ in scored[:5]]

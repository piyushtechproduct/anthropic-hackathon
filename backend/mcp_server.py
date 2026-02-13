"""
AI Commerce Agent MCP Server

Exposes shopping intent extraction tools via Model Context Protocol (MCP).
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

# Load environment variables
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

# Import services
from src.app.services import extract_intent, extract_multi_platform_intent

# Create MCP server
mcp = FastMCP("AI Commerce Agent")


@mcp.tool()
def extract_shopping_intent(prompt: str) -> dict:
    """
    Extract shopping intent from a natural language prompt for Amazon India.

    Args:
        prompt: Natural language shopping query (e.g., "white nike tshirt under 500 fast delivery")

    Returns:
        JSON object with:
        - raw_query: Cleaned search query
        - search_url: Amazon India search URL
        - filters: List of filter objects with type and value

    Example:
        Input: "white nike tshirt under 500 fast delivery"
        Output: {
            "raw_query": "white nike tshirt",
            "search_url": "https://www.amazon.in/s?k=white+nike+tshirt",
            "filters": [
                {"type": "brand", "value": "Nike"},
                {"type": "price", "value": "Under ₹500"},
                {"type": "delivery", "value": "Prime"},
                {"type": "color", "value": "White"}
            ]
        }
    """
    result = extract_intent(prompt)
    return {
        "raw_query": result.raw_query,
        "search_url": result.search_url,
        "filters": [{"type": f.type, "value": f.value} for f in result.filters]
    }


@mcp.tool()
def extract_multi_platform_shopping_intent(prompt: str) -> dict:
    """
    Extract shopping intent from a natural language prompt for both Amazon and Flipkart.

    Args:
        prompt: Natural language shopping query (e.g., "nike shoes under 2000")

    Returns:
        JSON object with:
        - raw_query: Cleaned search query
        - platforms: List of platform-specific intents (amazon, flipkart)
            - Each platform has: platform, search_url, filters[]

    Example:
        Input: "nike shoes under 2000"
        Output: {
            "raw_query": "nike shoes",
            "platforms": [
                {
                    "platform": "amazon",
                    "search_url": "https://www.amazon.in/s?k=nike+shoes",
                    "filters": [
                        {"type": "brand", "value": "Nike"},
                        {"type": "price", "value": "Under ₹2000"}
                    ]
                },
                {
                    "platform": "flipkart",
                    "search_url": "https://www.flipkart.com/search?q=nike+shoes",
                    "filters": [
                        {"type": "brand", "value": "Nike"},
                        {"type": "price", "value": "Under ₹2000"}
                    ]
                }
            ]
        }
    """
    result = extract_multi_platform_intent(prompt)
    return {
        "raw_query": result.raw_query,
        "platforms": [
            {
                "platform": p.platform.value,
                "search_url": p.search_url,
                "filters": [{"type": f.type, "value": f.value} for f in p.filters]
            }
            for p in result.platforms
        ]
    }


if __name__ == "__main__":
    # Run the MCP server with stdio transport
    mcp.run()

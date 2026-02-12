"""MCP server that exposes the commerce agent intent API as a tool."""

import json
from pathlib import Path

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

# Load .env from project root
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from src.app.services import extract_intent  # noqa: E402

mcp = FastMCP("commerce-agent")


@mcp.tool()
def extract_shopping_intent(prompt: str) -> str:
    """Extract structured shopping intent from a natural language prompt.

    Takes a user's shopping request (e.g. "white nike tshirt under 500 fast delivery")
    and returns a JSON object with:
    - search_url: Amazon India search URL
    - filters: list of filters to apply (brand, price, delivery, rating, etc.)
    - raw_query: cleaned search terms

    Args:
        prompt: Natural language shopping request
    """
    result = extract_intent(prompt)
    return json.dumps(result.model_dump(), indent=2)


if __name__ == "__main__":
    mcp.run()

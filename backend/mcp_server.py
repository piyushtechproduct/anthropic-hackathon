"""MCP server that exposes the commerce agent intent API as a tool."""

import json
from pathlib import Path

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

# Load .env from project root
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from src.app.services import extract_intent, extract_multi_platform_intent  # noqa: E402
from src.qa_agent.agent import run_qa_agent  # noqa: E402
from src.qa_agent.models import QAGenerateRequest, TestCategory  # noqa: E402

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


@mcp.tool()
def extract_multi_platform_shopping_intent(prompt: str) -> str:
    """Extract structured shopping intent for both Amazon India and Flipkart.

    Takes a user's shopping request and returns a JSON object with:
    - raw_query: cleaned search terms
    - platforms: list of platform-specific intents (amazon + flipkart), each with
      search_url and filters

    Args:
        prompt: Natural language shopping request
    """
    result = extract_multi_platform_intent(prompt)
    return json.dumps(result.model_dump(), indent=2)


@mcp.tool()
def generate_test_cases(
    categories: list[str] | None = None,
    force: bool = False,
    dry_run: bool = False,
    validate: bool = True,
) -> str:
    """Generate test cases from PRD documents and source code using AI.

    Reads PRD specs and source code, calls Claude API to generate runnable
    test files for the specified categories, writes them to disk, and
    optionally validates them.

    Args:
        categories: Test categories to generate. Options: backend_api, security,
                   performance, e2e, extension. Default: all categories.
        force: Overwrite existing generated tests (creates .bak backups).
        dry_run: Show what would be generated without writing files.
        validate: Run tests after generation to verify they pass.
    """
    cats = [TestCategory(c) for c in categories] if categories else list(TestCategory)
    request = QAGenerateRequest(
        categories=cats,
        force=force,
        dry_run=dry_run,
        run_validation=validate,
    )
    result = run_qa_agent(request)
    return json.dumps(result.model_dump(), indent=2)


if __name__ == "__main__":
    mcp.run()

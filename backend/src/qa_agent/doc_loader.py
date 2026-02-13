"""Loads PRD documents and extracts category-relevant sections."""

import logging
import re
from pathlib import Path

from src.qa_agent.models import TestCategory

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[3]

# Map each category to the PRD files and section headers most relevant to it.
CATEGORY_SECTIONS: dict[TestCategory, list[dict]] = {
    TestCategory.BACKEND_API: [
        {
            "file": "docs/AI_COMMERCE_AGENT_SPEC.md",
            "headers": [
                "Intent Extraction",
                "Filter",
                "Search Plan",
                "API",
                "Endpoint",
            ],
        },
        {
            "file": "docs/HACKATHON_SCOPE.md",
            "headers": ["API", "Endpoint", "Backend", "Intent"],
        },
    ],
    TestCategory.SECURITY: [
        {
            "file": "docs/AI_COMMERCE_AGENT_SPEC.md",
            "headers": [
                "Guardrail",
                "Security",
                "Validation",
                "Zero Trust",
                "Privacy",
                "Whitelist",
            ],
        },
        {
            "file": "docs/AI_COMMERCE_AGENT_ANALYSIS.md",
            "headers": ["Security", "Risk", "Guardrail", "Trust"],
        },
    ],
    TestCategory.PERFORMANCE: [
        {
            "file": "docs/AI_COMMERCE_AGENT_SPEC.md",
            "headers": ["Performance", "Latency", "Scale", "Concurrent"],
        },
        {
            "file": "docs/Use Case Questionnaire.md",
            "headers": ["Scale", "Performance", "Million"],
        },
    ],
    TestCategory.E2E: [
        {
            "file": "docs/AI_COMMERCE_AGENT_SPEC.md",
            "headers": [
                "Flow",
                "Pipeline",
                "End-to-End",
                "Search",
                "Filter",
                "Platform",
            ],
        },
        {
            "file": "docs/HACKATHON_SCOPE.md",
            "headers": ["Flow", "Architecture", "Pipeline", "Demo"],
        },
    ],
    TestCategory.EXTENSION: [
        {
            "file": "docs/AI_COMMERCE_AGENT_SPEC.md",
            "headers": ["Extension", "Adapter", "DOM", "Client"],
        },
        {
            "file": "docs/HACKATHON_SCOPE.md",
            "headers": ["Extension", "Adapter", "Content Script", "Chrome"],
        },
    ],
}


def load_sections_for_category(category: TestCategory) -> str:
    """Load and concatenate relevant PRD sections for a test category."""
    sections: list[str] = []
    configs = CATEGORY_SECTIONS.get(category, [])

    for config in configs:
        file_path = PROJECT_ROOT / config["file"]
        if not file_path.exists():
            logger.warning("PRD file not found: %s", file_path)
            continue

        text = file_path.read_text(encoding="utf-8")
        extracted = _extract_matching_sections(text, config["headers"])
        if extracted:
            sections.append(f"--- From {config['file']} ---\n{extracted}")

    if not sections:
        logger.warning("No PRD sections found for category %s", category)
        return ""

    return "\n\n".join(sections)


def _extract_matching_sections(markdown: str, keywords: list[str]) -> str:
    """Extract markdown sections whose headers contain any of the keywords."""
    # Split on ## headers (level 2+)
    pattern = re.compile(r"^(#{2,6})\s+(.+)$", re.MULTILINE)
    matches = list(pattern.finditer(markdown))

    if not matches:
        return ""

    extracted: list[str] = []
    keywords_lower = [k.lower() for k in keywords]

    for i, match in enumerate(matches):
        header_text = match.group(2).lower()
        if any(kw in header_text for kw in keywords_lower):
            start = match.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(markdown)
            section = markdown[start:end].strip()
            # Limit per-section size to avoid blowing up the prompt
            if len(section) > 3000:
                section = section[:3000] + "\n... (truncated)"
            extracted.append(section)

    return "\n\n".join(extracted)


def load_source_file(relative_path: str) -> str:
    """Load a source file relative to the project root."""
    path = PROJECT_ROOT / relative_path
    if not path.exists():
        logger.warning("Source file not found: %s", path)
        return ""
    return path.read_text(encoding="utf-8")


def load_existing_tests(category: TestCategory) -> str:
    """Load existing hand-written tests to provide as context (avoid duplication)."""
    tests_dir = PROJECT_ROOT / "backend" / "tests"
    if category == TestCategory.EXTENSION:
        tests_dir = PROJECT_ROOT / "extension" / "tests"

    test_files = []
    if tests_dir.exists():
        for f in sorted(tests_dir.iterdir()):
            if f.is_file() and f.suffix in (".py", ".ts") and "generated" not in str(f):
                test_files.append(f)

    if not test_files:
        return ""

    parts = []
    for f in test_files:
        content = f.read_text(encoding="utf-8")
        parts.append(f"--- {f.name} ---\n{content}")

    return "\n\n".join(parts)

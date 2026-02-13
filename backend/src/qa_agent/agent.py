"""Core QA Agent orchestration: load PRD → call Claude → parse → write → validate."""

import json
import logging
import os
import re
from pathlib import Path

import anthropic

from src.qa_agent.doc_loader import (
    load_existing_tests,
    load_sections_for_category,
    load_source_file,
)
from src.qa_agent.models import (
    GeneratedTestFile,
    QAGenerateRequest,
    QAGenerateResponse,
    TestCategory,
    ValidationResult,
)
from src.qa_agent.prompts import get_system_prompt
from src.qa_agent.validator import validate_generated_tests
from src.qa_agent.writer import should_skip, write_test_file

logger = logging.getLogger(__name__)

# Source files relevant to each category (passed to Claude as context)
CATEGORY_SOURCE_FILES: dict[TestCategory, list[str]] = {
    TestCategory.BACKEND_API: [
        "backend/src/app/services.py",
        "backend/src/app/models.py",
        "backend/src/app/main.py",
    ],
    TestCategory.SECURITY: [
        "backend/src/app/services.py",
        "backend/src/app/models.py",
        "backend/src/app/main.py",
    ],
    TestCategory.PERFORMANCE: [
        "backend/src/app/services.py",
        "backend/src/app/models.py",
        "backend/src/app/main.py",
    ],
    TestCategory.E2E: [
        "backend/src/app/services.py",
        "backend/src/app/models.py",
        "backend/src/app/main.py",
    ],
    TestCategory.EXTENSION: [
        "extension/src/adapters/utils.ts",
        "extension/src/adapters/types.ts",
        "extension/src/types.ts",
    ],
}


def run_qa_agent(request: QAGenerateRequest) -> QAGenerateResponse:
    """Main entry point: generate tests for requested categories."""
    all_files: list[GeneratedTestFile] = []
    all_validations: list[ValidationResult] = []
    errors: list[str] = []

    for category in request.categories:
        logger.info("Processing category: %s", category.value)

        # Check if we should skip
        skip, reason = should_skip(category, request.force)
        if skip:
            logger.info("Skipping %s: %s", category.value, reason)
            all_files.append(
                GeneratedTestFile(
                    path="",
                    category=category,
                    content="",
                    skipped=True,
                    reason=reason,
                )
            )
            continue

        try:
            # 1. Load context
            prd_sections = load_sections_for_category(category)
            source_code = _load_source_code(category)
            existing_tests = load_existing_tests(category)

            # 2. Call Claude API
            generated = _call_claude(
                category, prd_sections, source_code, existing_tests
            )

            if request.dry_run:
                for g in generated:
                    logger.info("[DRY RUN] Would write: %s", g.path)
                all_files.extend(generated)
                continue

            # 3. Write files
            written_paths: list[Path] = []
            for g in generated:
                path = write_test_file(g, request.force)
                written_paths.append(path)
            all_files.extend(generated)

            # 4. Validate
            if request.run_validation and written_paths:
                results = validate_generated_tests(category, written_paths)
                all_validations.extend(results)
                for r in results:
                    if not r.passed:
                        logger.warning(
                            "Test validation failed for %s (rc=%d)",
                            r.path,
                            r.return_code,
                        )

        except Exception as e:
            msg = f"Error generating tests for {category.value}: {e}"
            logger.exception(msg)
            errors.append(msg)

    return QAGenerateResponse(
        files=all_files,
        validation_results=all_validations,
        errors=errors,
    )


def _load_source_code(category: TestCategory) -> str:
    """Load source code files relevant to a category."""
    files = CATEGORY_SOURCE_FILES.get(category, [])
    parts = []
    for f in files:
        content = load_source_file(f)
        if content:
            parts.append(f"--- {f} ---\n{content}")
    return "\n\n".join(parts)


def _call_claude(
    category: TestCategory,
    prd_sections: str,
    source_code: str,
    existing_tests: str,
) -> list[GeneratedTestFile]:
    """Call Claude API to generate test files for a category."""
    system_prompt = get_system_prompt(category)

    user_message_parts = ["Generate test files for the following context:\n"]

    if prd_sections:
        user_message_parts.append(f"## PRD Requirements\n{prd_sections}\n")

    if source_code:
        user_message_parts.append(f"## Source Code\n{source_code}\n")

    if existing_tests:
        user_message_parts.append(
            f"## Existing Tests (DO NOT duplicate these)\n{existing_tests}\n"
        )

    user_message = "\n".join(user_message_parts)

    # Truncate if too long (stay within token limits)
    if len(user_message) > 80000:
        user_message = user_message[:80000] + "\n... (truncated)"

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    logger.info("Calling Claude API for category: %s", category.value)
    message = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=16384,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )

    response_text = message.content[0].text
    logger.info("Claude response length: %d chars", len(response_text))

    return _parse_response(category, response_text)


def _parse_response(
    category: TestCategory, response_text: str
) -> list[GeneratedTestFile]:
    """Parse Claude's response into GeneratedTestFile objects.

    Primary format: ### FILE: <filename> followed by ```lang ... ``` blocks.
    Fallback: try JSON parsing.
    """
    # Primary: extract ### FILE: header + code block pairs
    files = _extract_from_file_blocks(category, response_text)
    if files:
        return files

    # Fallback: try JSON
    cleaned = response_text.strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    try:
        data = json.loads(cleaned)
        if not isinstance(data, list):
            data = [data]
        for item in data:
            filename = item.get("filename", "")
            content = item.get("content", "")
            if filename and content:
                files.append(
                    GeneratedTestFile(path=filename, category=category, content=content)
                )
        if files:
            return files
    except json.JSONDecodeError:
        pass

    logger.error("Response first 2000 chars: %s", response_text[:2000])
    raise ValueError("Could not extract any test files from Claude's response")


def _extract_from_file_blocks(
    category: TestCategory, text: str
) -> list[GeneratedTestFile]:
    """Extract ### FILE: <filename> + code block pairs from Claude's response."""
    files = []

    # Match: ### FILE: <filename>\n```lang\n<code>\n```
    pattern = re.compile(
        r"###\s*FILE:\s*(\S+)\s*\n```[a-z]*\s*\n([\s\S]*?)```",
        re.MULTILINE,
    )

    for match in pattern.finditer(text):
        filename = match.group(1).strip()
        code = match.group(2).strip()
        if not code or len(code) < 50:
            continue
        files.append(GeneratedTestFile(path=filename, category=category, content=code))

    if not files:
        # Try broader pattern: any code block with a filename in preceding context
        ext = ".test.ts" if category == TestCategory.EXTENSION else "_gen.py"
        blocks = re.finditer(
            r"```(?:python|typescript|ts)?\s*\n([\s\S]*?)```",
            text,
        )
        for block in blocks:
            code = block.group(1).strip()
            if not code or len(code) < 50:
                continue
            # Search preceding text for a filename
            preceding = text[max(0, block.start() - 500) : block.start()]
            fname_match = re.search(r"([\w.-]+" + re.escape(ext) + r")", preceding)
            if fname_match:
                filename = fname_match.group(1)
            else:
                idx = len(files) + 1
                filename = f"test_generated_{idx}{ext}"
            files.append(
                GeneratedTestFile(path=filename, category=category, content=code)
            )

    if files:
        logger.info("Extracted %d test files from response", len(files))

    return files

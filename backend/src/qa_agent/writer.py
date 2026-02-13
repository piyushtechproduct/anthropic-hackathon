"""Writes generated test files to disk with collision-safe logic."""

import logging
import shutil
from pathlib import Path

from src.qa_agent.models import GeneratedTestFile, TestCategory

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[3]

OUTPUT_DIRS: dict[TestCategory, Path] = {
    TestCategory.BACKEND_API: PROJECT_ROOT / "backend" / "tests" / "generated",
    TestCategory.SECURITY: PROJECT_ROOT / "backend" / "tests" / "generated",
    TestCategory.PERFORMANCE: PROJECT_ROOT / "backend" / "tests" / "generated",
    TestCategory.E2E: PROJECT_ROOT / "backend" / "tests" / "generated",
    TestCategory.EXTENSION: PROJECT_ROOT / "extension" / "tests" / "generated",
}

# Expected file prefixes per category so skip logic is category-specific
CATEGORY_FILE_PREFIXES: dict[TestCategory, list[str]] = {
    TestCategory.BACKEND_API: ["test_intent_edge", "test_rank_edge"],
    TestCategory.SECURITY: ["test_security"],
    TestCategory.PERFORMANCE: ["test_performance"],
    TestCategory.E2E: ["test_e2e"],
    TestCategory.EXTENSION: ["adapters"],
}


def should_skip(category: TestCategory, force: bool) -> tuple[bool, str]:
    """Check if generation should be skipped (files already exist and not forced)."""
    output_dir = OUTPUT_DIRS[category]
    if not output_dir.exists():
        return False, ""

    existing = _list_generated_files(output_dir, category)
    if existing and not force:
        return True, f"Generated files already exist: {[f.name for f in existing]}"

    return False, ""


def write_test_file(file: GeneratedTestFile, force: bool) -> Path:
    """Write a single test file to disk. Returns the written path."""
    output_dir = OUTPUT_DIRS[file.category]
    output_dir.mkdir(parents=True, exist_ok=True)

    # Strip any path prefixes — always write just the filename into the output dir
    filename = Path(file.path).name
    dest = output_dir / filename
    if dest.exists() and force:
        # Create backup before overwriting
        backup = dest.with_suffix(dest.suffix + ".bak")
        shutil.copy2(dest, backup)
        logger.info("Backed up existing file to %s", backup)

    dest.write_text(file.content, encoding="utf-8")
    logger.info("Wrote test file: %s", dest)
    return dest


def _list_generated_files(output_dir: Path, category: TestCategory) -> list[Path]:
    """List existing generated test files for this specific category."""
    if not output_dir.exists():
        return []

    prefixes = CATEGORY_FILE_PREFIXES.get(category, [])
    if category == TestCategory.EXTENSION:
        all_files = sorted(output_dir.glob("*.test.ts"))
    else:
        all_files = sorted(output_dir.glob("*_gen.py"))

    if not prefixes:
        return all_files

    return [f for f in all_files if any(f.name.startswith(p) for p in prefixes)]

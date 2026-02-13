"""Runs pytest/vitest on generated tests and reports results."""

import logging
import subprocess
from pathlib import Path

from src.qa_agent.models import TestCategory, ValidationResult

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[3]


def validate_generated_tests(
    category: TestCategory, file_paths: list[Path]
) -> list[ValidationResult]:
    """Run the appropriate test runner on generated test files."""
    results = []

    if category == TestCategory.EXTENSION:
        for path in file_paths:
            result = _run_vitest(path)
            results.append(result)
    else:
        for path in file_paths:
            result = _run_pytest(path)
            results.append(result)

    return results


def _run_pytest(path: Path) -> ValidationResult:
    """Run pytest on a single test file."""
    logger.info("Running pytest on %s", path)
    try:
        result = subprocess.run(
            ["uv", "run", "pytest", str(path), "-v", "--tb=short", "-x"],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=PROJECT_ROOT / "backend",
        )
        return ValidationResult(
            path=str(path),
            passed=result.returncode == 0,
            output=result.stdout + result.stderr,
            return_code=result.returncode,
        )
    except subprocess.TimeoutExpired:
        return ValidationResult(
            path=str(path),
            passed=False,
            output="Test execution timed out after 120s",
            return_code=-1,
        )
    except Exception as e:
        return ValidationResult(
            path=str(path),
            passed=False,
            output=f"Failed to run pytest: {e}",
            return_code=-1,
        )


def _run_vitest(path: Path) -> ValidationResult:
    """Run vitest on a single test file."""
    logger.info("Running vitest on %s", path)
    try:
        result = subprocess.run(
            ["npx", "vitest", "run", str(path)],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=PROJECT_ROOT / "extension",
        )
        return ValidationResult(
            path=str(path),
            passed=result.returncode == 0,
            output=result.stdout + result.stderr,
            return_code=result.returncode,
        )
    except subprocess.TimeoutExpired:
        return ValidationResult(
            path=str(path),
            passed=False,
            output="Test execution timed out after 120s",
            return_code=-1,
        )
    except Exception as e:
        return ValidationResult(
            path=str(path),
            passed=False,
            output=f"Failed to run vitest: {e}",
            return_code=-1,
        )

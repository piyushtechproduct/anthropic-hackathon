"""CLI entry point for the QA Agent."""

import argparse
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root
load_dotenv(Path(__file__).resolve().parents[3] / ".env")

from src.qa_agent.agent import run_qa_agent  # noqa: E402
from src.qa_agent.models import ALL_CATEGORIES, QAGenerateRequest, TestCategory  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="QA Agent — generate test cases from PRD docs + source code"
    )
    parser.add_argument(
        "--categories",
        nargs="+",
        choices=[c.value for c in TestCategory],
        default=[c.value for c in ALL_CATEGORIES],
        help="Test categories to generate (default: all)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing generated tests (creates .bak backups)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be generated without writing files",
    )
    parser.add_argument(
        "--no-validate",
        action="store_true",
        help="Skip running tests after generation",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable verbose logging",
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    categories = [TestCategory(c) for c in args.categories]

    request = QAGenerateRequest(
        categories=categories,
        force=args.force,
        dry_run=args.dry_run,
        run_validation=not args.no_validate,
    )

    result = run_qa_agent(request)

    # Print summary
    print("\n" + "=" * 60)
    print("QA Agent — Generation Summary")
    print("=" * 60)

    for f in result.files:
        if f.skipped:
            print(f"  SKIP  {f.category.value}: {f.reason}")
        elif args.dry_run:
            print(f"  DRY   {f.category.value}: {f.path}")
        else:
            print(f"  WRITE {f.category.value}: {f.path}")

    if result.validation_results:
        print("\nValidation Results:")
        for v in result.validation_results:
            status = "PASS" if v.passed else "FAIL"
            print(f"  {status}  {v.path}")
            if not v.passed:
                # Show last 20 lines of output for failures
                lines = v.output.strip().split("\n")
                for line in lines[-20:]:
                    print(f"        {line}")

    if result.errors:
        print("\nErrors:")
        for e in result.errors:
            print(f"  ERROR {e}")

    print("=" * 60)

    # Exit code: 0 if all validations passed (or no validation), 1 otherwise
    if any(not v.passed for v in result.validation_results):
        return 1
    if result.errors:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

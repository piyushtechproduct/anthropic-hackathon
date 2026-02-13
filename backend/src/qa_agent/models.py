"""Pydantic models for the QA Agent."""

from enum import Enum

from pydantic import BaseModel


class TestCategory(str, Enum):
    BACKEND_API = "backend_api"
    SECURITY = "security"
    PERFORMANCE = "performance"
    E2E = "e2e"
    EXTENSION = "extension"


ALL_CATEGORIES = list(TestCategory)


class QAGenerateRequest(BaseModel):
    categories: list[TestCategory] = ALL_CATEGORIES
    force: bool = False
    dry_run: bool = False
    run_validation: bool = True


class GeneratedTestFile(BaseModel):
    path: str
    category: TestCategory
    content: str
    skipped: bool = False
    reason: str = ""


class ValidationResult(BaseModel):
    path: str
    passed: bool
    output: str
    return_code: int


class QAGenerateResponse(BaseModel):
    files: list[GeneratedTestFile]
    validation_results: list[ValidationResult] = []
    errors: list[str] = []

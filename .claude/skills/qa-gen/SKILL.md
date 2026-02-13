---
name: qa-gen
description: Generate test cases from PRD docs and source code using the QA Agent
user-invocable: true
---

# QA Test Generation

Generate runnable test cases by analyzing PRD documents and source code with Claude API.

## Usage

Run the QA Agent CLI from the backend directory:

```bash
cd backend && uv run python -m src.qa_agent
```

### Options

- `--categories backend_api security performance e2e extension` — choose specific categories (default: all)
- `--force` — overwrite existing generated tests (creates .bak backups)
- `--dry-run` — preview what would be generated without writing
- `--no-validate` — skip running tests after generation
- `--verbose` / `-v` — enable debug logging

### Examples

Generate all test categories:
```bash
cd backend && uv run python -m src.qa_agent
```

Generate only backend API and security tests:
```bash
cd backend && uv run python -m src.qa_agent --categories backend_api security
```

Force regeneration with validation:
```bash
cd backend && uv run python -m src.qa_agent --force
```

Dry run to preview:
```bash
cd backend && uv run python -m src.qa_agent --dry-run
```

## Output Locations

- Backend tests: `backend/tests/generated/*_gen.py`
- Extension tests: `extension/tests/generated/*.test.ts`

## Test Categories

| Category | What it generates |
|----------|-------------------|
| `backend_api` | Intent/rank endpoint edge cases |
| `security` | XSS, injection, CORS, schema validation |
| `performance` | Concurrent requests, latency, large payloads |
| `e2e` | Full prompt→intent→URL→filter flows |
| `extension` | Adapter utility function unit tests |

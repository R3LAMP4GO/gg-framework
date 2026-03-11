# /setup-tests — Auto-Scaffold Comprehensive Tests

Detect project type and set up testing infrastructure with 2026 best practices.

## Step 1: Analyze Project

Use `find`, `ls`, and `read` to detect:
- Language and framework
- Existing test files and framework
- Source file structure and key business logic

## Step 2: Pick Test Tools

Use `web_search` to confirm current (2026) recommended tools:

| Language | Unit/Integration | E2E | Notes |
|----------|------------------|-----|-------|
| **JS/TS** | **Vitest** | **Playwright** | Vitest over Jest — native ESM/TS, 10-20x faster. Testing Library for components. |
| **Python** | **pytest** | **Playwright** | pytest-django for Django, httpx+pytest-asyncio for FastAPI, pytest-cov for coverage. |
| **Go** | testing + **testify** | httptest | testcontainers-go for integration. Table-driven tests. |
| **Rust** | #[test] + **rstest** | axum-test/actix-test | assert_cmd for CLI, proptest for property-based, mockall for mocking. |
| **PHP** | **Pest 4** (Laravel) / PHPUnit 12 | Laravel Dusk | Pest preferred for Laravel. |

## Step 3: Spawn 4 Parallel Tasks

Use the `tasks` tool to create 4 tasks simultaneously:

### Task 1 — Dependencies & Config
**Title:** Install test deps and create config
**Prompt:** In `[CWD]`, a [LANGUAGE/FRAMEWORK] project, install test dependencies and create config files. Detected stack: [STACK DETAILS]. Install [SPECIFIC PACKAGES] using `bash`. Create config files ([SPECIFIC CONFIG FILES]) using `write`. Verify installation succeeds with zero errors.

### Task 2 — Unit Tests
**Title:** Create unit tests for business logic
**Prompt:** In `[CWD]`, a [LANGUAGE/FRAMEWORK] project using [TEST FRAMEWORK], create comprehensive unit tests. Read all source files in [SOURCE DIRS] to understand the business logic. Create test files that cover: all exported functions, edge cases (null/empty/boundary), error paths, and happy paths. Write tests to [TEST DIR]. Use [FRAMEWORK PATTERNS]. Every test must be runnable.

### Task 3 — Integration Tests
**Title:** Create integration tests
**Prompt:** In `[CWD]`, a [LANGUAGE/FRAMEWORK] project using [TEST FRAMEWORK], create integration tests for APIs, database operations, and service interactions. Read source files to find all endpoints/services. Create tests that verify components work together. Write to [TEST DIR]. Mock external dependencies, test real internal interactions.

### Task 4 — E2E Tests (if applicable)
**Title:** Create E2E tests for critical flows
**Prompt:** In `[CWD]`, a [LANGUAGE/FRAMEWORK] project, create end-to-end tests using [E2E FRAMEWORK] for critical user flows. Read the codebase to identify the 3-5 most important user journeys. Create E2E tests that exercise these flows. Write to [E2E TEST DIR]. Include setup/teardown for test data.

## Step 4: Verify

After all tasks complete:
1. Run the full test suite via `bash`
2. Fix any failing tests
3. Report coverage summary

## Step 5: Report

```
✅ Test infrastructure set up
  Framework: [name + version]
  Unit tests: N tests across M files
  Integration tests: N tests across M files
  E2E tests: N tests across M files
  Run with: [exact command]
```

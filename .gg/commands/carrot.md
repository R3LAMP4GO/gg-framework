# /carrot — Verify Against Real-World Patterns

Verify this codebase against current best practices using 8 parallel task agents. Every finding must be backed by `mcp__grep__searchGitHub` (real code samples) or `web_search` (official docs).

## Instructions

First, detect the project's stack with `find` and `read` (package.json, config files, etc.). Then create all 8 tasks at once using the `tasks` tool.

Replace `[CWD]` with the actual working directory and `[STACK]` with detected stack info.

### Task 1 — Core Framework
**Title:** Verify framework usage patterns
**Prompt:** In `[CWD]`, detect the main framework ([STACK]). Read key source files to find framework usage patterns. Use `web_search` to check official docs for current recommended patterns. Compare. Only report: OUTDATED (old patterns with verified better alternatives), DEPRECATED (APIs marked deprecated in official docs), or INCORRECT (contradicts docs). Output: `[OUTDATED/DEPRECATED/INCORRECT] file:line - what it is | Current: correct approach | Source: URL`. No findings is valid.

### Task 2 — Dependencies/Libraries
**Title:** Check for deprecated library APIs
**Prompt:** In `[CWD]`, read dependency files and scan source for library API calls. Use `web_search` to check if any APIs used are deprecated in current versions. Use `mcp__grep__searchGitHub` to see how modern codebases use these same libraries. Only report DEPRECATED or OUTDATED usage. Output: `[OUTDATED/DEPRECATED] file:line - what it is | Current: correct approach | Source: URL or GitHub search`. No findings is valid.

### Task 3 — Language Patterns
**Title:** Verify language idioms are current
**Prompt:** In `[CWD]`, identify the primary language ([STACK]). Read source files and check for outdated language patterns. Use `mcp__grep__searchGitHub` to compare against how modern projects write similar code. Only report patterns that are verifiably outdated — not style preferences. Output: `[OUTDATED] file:line - what it is | Current: correct approach | Source: GitHub search evidence`. No findings is valid.

### Task 4 — Configuration
**Title:** Verify build/lint/config settings
**Prompt:** In `[CWD]`, read all config files (tsconfig, eslint, webpack/vite, etc.). Use `web_search` to check current tool documentation for recommended settings. Report only settings that are DEPRECATED or INCORRECT per official docs. Output: `[DEPRECATED/INCORRECT] file:line - what it is | Current: correct setting | Source: URL`. No findings is valid.

### Task 5 — Security Patterns
**Title:** Verify security patterns
**Prompt:** In `[CWD]`, review auth implementation, data handling, secrets management. Use `web_search` to check against current OWASP guidance and security best practices. Only report verifiable security anti-patterns — not theoretical risks. Output: `[OUTDATED/INCORRECT] file:line - what it is | Current: correct approach | Source: URL`. No findings is valid.

### Task 6 — Testing
**Title:** Verify testing patterns are current
**Prompt:** In `[CWD]`, identify the test framework and read test files. Use `web_search` to verify testing patterns match current library recommendations. Use `mcp__grep__searchGitHub` to compare against modern test patterns. Only report DEPRECATED or OUTDATED testing approaches. Output: `[OUTDATED/DEPRECATED] file:line - what it is | Current: correct approach | Source: URL or GitHub search`. No findings is valid.

### Task 7 — API/Data Handling
**Title:** Verify data fetching/state patterns
**Prompt:** In `[CWD]`, review data fetching, state management, and storage patterns. Use `mcp__grep__searchGitHub` and `web_search` to verify against current framework recommendations. Only report OUTDATED or DEPRECATED patterns with evidence. Output: `[OUTDATED/DEPRECATED] file:line - what it is | Current: correct approach | Source: URL or GitHub search`. No findings is valid.

### Task 8 — Error Handling
**Title:** Verify error handling patterns
**Prompt:** In `[CWD]`, examine error handling patterns across the codebase. Use `mcp__grep__searchGitHub` to compare against real-world implementations. Use `web_search` to check library documentation for recommended error handling. Only report INCORRECT patterns that contradict docs. Output: `[INCORRECT] file:line - what it is | Current: correct approach | Source: URL or GitHub search`. No findings is valid.

## After All Tasks Complete

Collect results. Present unified report:

```
## 🔴 DEPRECATED (will break on upgrade)
## 🟡 OUTDATED (works but has better alternatives)
## 🟠 INCORRECT (contradicts official docs)
```

Each finding must include its verification source. No source = not reported.

If nothing found: "✅ Codebase aligns with current best practices."

# /research — Best Tools & Deps for Your Project

Research the best 2026 tools, dependencies, and patterns for what you want to build, then output a concise RESEARCH.md.

## Step 0: Get Project Description

If the user hasn't described what they're building, ask:
**"What are you building? Describe features, target platform, and any constraints."**

Store as `$PROJECT_DESC`. If working in an existing project, also scan `find` + `ls` + `read` to understand what's already in place.

## Step 1: Spawn 6 Parallel Tasks

Use the `tasks` tool to create all 6 at once:

### Task 1 — Project Scan
**Title:** Scan existing project structure
**Prompt:** In `[CWD]`, catalog everything that exists: use `ls`, `find`, and `read` to document package.json/config files, installed deps, directory structure, language/framework choices. Output a structured summary of what's already in place. Be exhaustive — other tasks depend on this.

### Task 2 — Stack Validation
**Title:** Validate stack choice for 2026
**Prompt:** For a project described as: "$PROJECT_DESC" — use `web_search` to research whether [CURRENT STACK] is the best choice in 2026. Compare the top 2-3 alternatives on performance, ecosystem size, and developer experience. Pick ONE winner. If the current stack is already best, confirm with evidence. Output: Winner, why, and 2-3 bullet comparison. Every claim must have a source URL.

### Task 3 — Core Dependencies
**Title:** Research best deps for each feature
**Prompt:** For a [STACK] project that needs: $PROJECT_DESC — use `web_search` to find the single best library for EACH feature in 2026. Confirm latest stable version numbers via search. Use `mcp__grep__searchGitHub` to verify real projects actually use these libraries. Output a table: package | exact version | one-line purpose. No outdated packages. No "popular in 2023" picks.

### Task 4 — Dev Tooling
**Title:** Research best 2026 dev tooling
**Prompt:** For a [STACK] project — use `web_search` to find the best 2026 dev tooling: package manager, bundler, linter, formatter, test framework, type checker. Pick ONE per category. Verify current recommendations via official docs. Output: tool | version | category. Include exact versions confirmed via search.

### Task 5 — Architecture
**Title:** Research project architecture patterns
**Prompt:** For a [STACK] project building $PROJECT_DESC — use `mcp__grep__searchGitHub` to find how real 2026 projects of this type structure their code. Search for directory layouts, file naming conventions, key patterns (state management, routing, data fetching). Output a concrete directory tree and list of patterns to follow with GitHub evidence.

### Task 6 — Config & Integration
**Title:** Research config files needed
**Prompt:** For a [STACK] project with [DETECTED TOOLING] — use `web_search` for current config best practices. Cover: linter config, formatter config, TS/type config, env setup, CI basics. Output exact config file contents or key settings for each file that should be created.

## Step 2: Synthesize into RESEARCH.md

After all tasks complete, use `write` to create `RESEARCH.md` in the project root:

```markdown
# RESEARCH: [short project description]
Generated: [today's date]
Stack: [framework + language + runtime]

## INSTALL
[exact shell commands — copy-paste ready, in order]

## DEPENDENCIES
| package | version | purpose |
|---------|---------|---------|
[each purpose max 5 words]

## DEV DEPENDENCIES
| package | version | purpose |
|---------|---------|---------|

## CONFIG FILES TO CREATE
### [filename]
[exact contents or key settings]

## PROJECT STRUCTURE
[tree of recommended directories and key files]

## SETUP STEPS
1. [concrete action]
2. [concrete action]

## KEY PATTERNS
[brief list with one-line descriptions]

## SOURCES
[URLs used, grouped by section]
```

Rules: No alternatives sections. No "why" explanations. No hedging. Every version verified. Commands copy-paste ready.

## Step 3: Confirm

Tell the user RESEARCH.md is ready and summarize what was researched in 3-5 bullets.

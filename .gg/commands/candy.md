# /candy — Codebase Health Scan

Find low-risk, high-reward wins across the codebase using 5 parallel task agents.

## Instructions

Use the `tasks` tool to create 5 parallel tasks. Each task is a standalone investigation focused on one area. Adapt each to the project's actual stack and architecture.

Before creating tasks, run `find` and `ls` to understand the project structure, then create all 5 tasks at once:

### Task 1 — Performance
**Title:** Scan for performance issues
**Prompt:** In the project at `[CWD]`, scan all source files for performance problems: inefficient algorithms, unnecessary work inside loops, missing early returns, blocking operations in async contexts, N+1 queries, things that scale poorly. Use `find`, `grep`, and `read` to examine source files. Only report issues that are Dead (unused/unreachable), Broken (will cause errors), or Dangerous (security/resource exhaustion). Output format: `[DEAD/BROKEN/DANGEROUS] file:line - description | Impact: what happens if unfixed`. Finding nothing is valid.

### Task 2 — Dead Weight
**Title:** Scan for dead/unused code
**Prompt:** In the project at `[CWD]`, scan for dead weight: unused exports, unreachable code paths, stale TODO comments older than 6 months, obsolete files, imports that lead nowhere, unused dependencies in package.json/requirements.txt/Cargo.toml. Use `find`, `grep`, and `read`. Only report: Dead (literally does nothing), Broken (will cause errors), or Dangerous (security holes). Output: `[DEAD/BROKEN/DANGEROUS] file:line - description | Impact: what happens if unfixed`. Finding nothing is valid.

### Task 3 — Lurking Bugs
**Title:** Scan for hidden bugs
**Prompt:** In the project at `[CWD]`, scan for lurking bugs: unhandled edge cases (null/undefined/empty), missing error handling on I/O and network calls, resource leaks (unclosed connections/files/streams), race conditions, silent failures that swallow errors. Use `find`, `grep`, and `read` to examine source files. Only report: Dead, Broken (WILL cause errors, not "might"), or Dangerous. Output: `[DEAD/BROKEN/DANGEROUS] file:line - description | Impact: what happens if unfixed`. Finding nothing is valid.

### Task 4 — Security
**Title:** Scan for security issues
**Prompt:** In the project at `[CWD]`, scan for security issues: hardcoded secrets/API keys, SQL/command injection risks, exposed sensitive data in logs or responses, overly permissive CORS or file access, unsafe defaults, missing input validation on user-facing endpoints. Use `find`, `grep`, and `read`. Only report Dangerous findings. Output: `[DANGEROUS] file:line - description | Impact: what happens if unfixed`. Finding nothing is valid.

### Task 5 — Dependencies & Config
**Title:** Scan deps and config
**Prompt:** In the project at `[CWD]`, scan for dependency and config issues: unused packages still in dependency files, known vulnerable dependency versions, misconfigured settings, dead environment variables referenced but never set, orphaned config files. Use `find`, `grep`, `read`, and `bash` (to run `npm audit` / `pip audit` / `cargo audit` if available). Only report: Dead, Broken, or Dangerous. Output: `[DEAD/BROKEN/DANGEROUS] file:line - description | Impact: what happens if unfixed`. Finding nothing is valid.

## After All Tasks Complete

Collect results from all 5 tasks. Deduplicate. Present a unified report grouped by severity:

```
## 🔴 DANGEROUS (fix now)
## 🟡 BROKEN (will cause errors)
## ⚪ DEAD (safe to remove)
```

If nothing found: "✅ Codebase is clean — no low-hanging fruit detected."

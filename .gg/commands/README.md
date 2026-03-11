# GG Coder Commands

Reusable prompt commands for GG Coder by Ken Kai — ported and adapted from [minimal-claude](https://github.com/KenKaiii/minimal-claude) plugin patterns for GG Coder's native toolset.

## Commands

| Command | Description |
|---------|-------------|
| [`commit`](commands/commit.md) | Lint → typecheck → AI commit message → push |
| [`candy`](commands/candy.md) | 5-agent parallel codebase health scan (dead code, bugs, security) |
| [`carrot`](commands/carrot.md) | 8-agent parallel verification against real-world patterns & docs |
| [`setup-tests`](commands/setup-tests.md) | Auto-detect stack → scaffold comprehensive tests |
| [`research`](commands/research.md) | 6-agent research → output actionable RESEARCH.md |
| [`setup-quality`](commands/setup-quality.md) | Auto-detect project → configure linting/typechecking |

## Usage

Copy-paste a command's content as your prompt to GG Coder, or reference the file directly.

These commands leverage GG Coder's built-in tools:
- `bash` — run shell commands (lint, test, git)
- `find` / `grep` / `read` — explore codebase
- `tasks` — spawn parallel sub-tasks
- `web_search` / `web_fetch` — research docs
- `mcp__grep__searchGitHub` — verify against real-world code

## Differences from Claude Code Plugin

| Feature | Claude Code | GG Coder |
|---------|-------------|----------|
| Parallel agents | Task tool (subagent) | `tasks` tool (task pane) |
| Code search | Grep MCP (if configured) | `mcp__grep__searchGitHub` (built-in) |
| Web research | WebSearch (if configured) | `web_search` + `web_fetch` (built-in) |
| Slash commands | `/command` syntax | Copy-paste or file reference |
| Hooks | hooks.json events | Not applicable |

## License

MIT

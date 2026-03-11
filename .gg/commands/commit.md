# /commit — Quality Check + AI Commit + Push

Run quality checks, generate an AI commit message, and push. Stop on any errors.

## Step 1: Detect Project Type and Package Manager

Use `find` and `read` to detect the project:

| File Found | Type | Lint Command | Typecheck Command |
|------------|------|--------------|-------------------|
| `package.json` | JS/TS | `[PM] run lint` (if script exists) | `[PM] run typecheck` or `npx tsc --noEmit` (if TS) |
| `pyproject.toml` | Python | `ruff check .` or `pylint src/` | `mypy .` |
| `go.mod` | Go | `go vet ./...` | N/A (compiled) |
| `Cargo.toml` | Rust | `cargo clippy -- -D warnings` | N/A (compiled) |
| `composer.json` | PHP | `./vendor/bin/phpstan analyse` | N/A |

**Detect package manager** (for JS/TS projects):
- `bun.lockb` or `bun.lock` → use `bun`
- `pnpm-lock.yaml` → use `pnpm`
- `yarn.lock` → use `yarn`
- `package-lock.json` → use `npm`

Replace `[PM]` with the detected package manager in all commands.

Check `package.json` scripts to find the actual lint/typecheck script names — don't assume they're called `lint` and `typecheck`.

## Step 2: Run Quality Checks

Execute the detected commands via `bash`. If ANY command returns errors:
1. Read the error output
2. Fix all errors using `edit`
3. Re-run checks until clean
4. Only proceed when zero errors remain

## Step 3: Review Changes

```bash
git status
git diff --staged
git diff
```

Read the output. Understand what changed.

## Step 4: Stage Everything

```bash
git add -A
```

## Step 5: Generate Commit Message

Based on the diff, generate a commit message:
- Start with a verb: Add, Update, Fix, Remove, Refactor, Implement, Extract, Simplify
- Be specific about WHAT changed, not how
- One line, under 72 characters preferred
- If multiple unrelated changes, use a summary line + bullet body

Good: `Fix JWT token expiry not respecting refresh window`
Bad: `Update code` or `Fix bug`

## Step 6: Commit and Push

```bash
git commit -m "your generated message"
git push
```

If push fails (no upstream), run:
```bash
git push -u origin $(git branch --show-current)
```

## Step 7: Confirm

Report: ✅ Committed and pushed: `<message>` (N files changed)
